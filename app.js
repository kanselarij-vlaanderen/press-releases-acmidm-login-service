import { app, query, errorHandler } from 'mu';
import { getSessionIdHeader } from './utils';
import { getAccessToken } from './lib/openid';
import {
  removeOldSessions, removeCurrentSession,
  ensureUserGroup, ensureUserAndAccount,
  insertNewSessionForAccount,
  selectAccountBySession, selectCurrentSession
} from './lib/session';

/**
 * Configuration validation on startup
 */
const requiredEnvironmentVariables = [
  'MU_APPLICATION_AUTH_DISCOVERY_URL',
  'MU_APPLICATION_AUTH_CLIENT_ID',
  'MU_APPLICATION_AUTH_CLIENT_SECRET',
  'MU_APPLICATION_AUTH_REDIRECT_URI'
];

requiredEnvironmentVariables.forEach(key => {
  if (!process.env[key]) {
    console.log(`Environment variable ${key} must be configured`);
    process.exit(1);
  }
});

/**
 * Log the user in by creating a new session, i.e. attaching the user's
 * account to a session.
 *
 * Before creating a new session, the given authorization code gets exchanged
 * for an access token with an OpenID Provider (ACM/IDM) using
 * the configured discovery URL.
 * The returned JWT access token is decoded to retrieve information
 * to attach to the user, account and the session. If the OpenID Provider
 * returns a valid access token, a new user and account are created if they
 * don't exist yet and a the account is attached to the session.
 *
 * Body: { authorizationCode: "secret" }
 *
 * @return [201] On successful login containing the newly created session
 * @return [400] If the session header or authorization code is missing
 * @return [401] On login failure (unable to retrieve a valid access token)
 * @return [403] If no user-group can be linked to the session
*/
app.post('/sessions', async function (req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri) {
    const error = new Error('Session header is missing');
    error.status = 400;
    return next(error);
  }

  const authorizationCode = req.body['authorizationCode'];
  if (!authorizationCode) {
    const error = new Error('Authorization code is missing');
    error.status = 400;
    console.log(`[${error.status}] ${error.message}`);
    return next(error);
  }

  try {
    let tokenSet;
    try {
      tokenSet = await getAccessToken(authorizationCode);
    } catch (e) {
      const error = new Error(`Failed to retrieve access token for authorization code: ${e.message || e}`);
      error.status = 401;
      console.log(`[${error.status}] ${error.message}`);
      return next(error);
    }

    await removeOldSessions(sessionUri);

    const claims = tokenSet.claims();

    if (process.env['DEBUG_LOG_TOKENSETS']) {
      console.log(`Received tokenSet ${JSON.stringify(tokenSet)} including claims ${JSON.stringify(claims)}`);
    }

    const { groupUri, groupId } = await ensureUserGroup(claims);
    const { accountUri, accountId } = await ensureUserAndAccount(claims, { id: groupId, uri: groupUri });

    if (!groupUri || !groupId) {
      console.log(`User is not allowed to login. No user group found`);
      return res.header('mu-auth-allowed-groups', 'CLEAR').status(403).end();
    }

    const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri);

    return res.header('mu-auth-allowed-groups', 'CLEAR').status(201).send({
      links: {
        self: '/sessions/current'
      },
      data: {
        type: 'sessions',
        id: sessionId,
        attributes: {

        }
      },
      relationships: {
        account: {
          links: { related: `/accounts/${accountId}` },
          data: { type: 'accounts', id: accountId }
        },
        group: {
          links: { related: `/user-groups/${groupId}` },
          data: { type: 'user-groups', id: groupId }
        }
      }
    });
  } catch (e) {
    console.log(`Something went wrong during login: ${e.message}`);
    console.trace(e);
    return next(new Error(e.message));
  }
});


/**
 * Log out from the current session,
 * i.e. detaching the session from the user's account.
 *
 * @return [204] On successful logout
 * @return [400] If the session header is missing or invalid
*/
app.delete('/sessions/current', async function (req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri) {
    const error = new Error('Session header is missing');
    error.status = 400;
    return next(error);
  }

  try {
    const { accountUri } = await selectAccountBySession(sessionUri);
    if (!accountUri) {
      const error = new Error('Invalid session');
      error.status = 400;
      return next(error);
    }

    await removeCurrentSession(sessionUri);

    return res.header('mu-auth-allowed-groups', 'CLEAR').status(204).end();
  } catch (e) {
    console.log(`Something went wrong during logout: ${e.message}`);
    console.trace(e);
    return next(new Error(e.message));
  }
});


/**
 * Get the current session
 *
 * @return [200] The current session
 * @return [400] If the session header is missing or invalid
*/
app.get('/sessions/current', async function (req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri) {
    const error = new Error('Session header is missing');
    error.status = 400;
    return next(error);
  }

  try {
    const { accountUri, accountId } = await selectAccountBySession(sessionUri);
    if (!accountUri) {
      const error = new Error('Invalid session');
      error.status = 400;
      return next(error);
    }

    const { sessionId, groupId } = await selectCurrentSession(accountUri);

    return res.status(200).send({
      links: {
        self: '/sessions/current'
      },
      data: {
        type: 'sessions',
        id: sessionId,
        attributes: {

        }
      },
      relationships: {
        account: {
          links: { related: `/accounts/${accountId}` },
          data: { type: 'accounts', id: accountId }
        },
        group: {
          links: { related: `/user-groups/${groupId}` },
          data: { type: 'user-groups', id: groupId }
        }
      }
    });

  } catch (e) {
    console.log(`Something went wrong while retrieving the current session: ${e.message}`);
    console.trace(e);
    return next(new Error(e.message));
  }
});


app.use(errorHandler);
