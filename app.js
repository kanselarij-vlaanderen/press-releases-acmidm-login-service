import { app, query, errorHandler } from 'mu';

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
});


/**
 * Log out from the current session,
 * i.e. detaching the session from the user's account.
 *
 * @return [204] On successful logout
 * @return [400] If the session header is missing or invalid
*/
app.delete('/sessions/current', async function (req, res, next) {
});


/**
 * Get the current session
 *
 * @return [200] The current session
 * @return [400] If the session header is missing or invalid
*/
app.get('/sessions/current', async function (req, res, next) {
});


app.use(errorHandler);
