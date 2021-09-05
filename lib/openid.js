import { Issuer, custom } from 'openid-client';

const discoveryUrl = process.env.MU_APPLICATION_AUTH_DISCOVERY_URL;
const clientId = process.env.MU_APPLICATION_AUTH_CLIENT_ID;
const clientSecret = process.env.MU_APPLICATION_AUTH_CLIENT_SECRET;
const redirectUri = process.env.MU_APPLICATION_AUTH_REDIRECT_URI;
const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 2500;
const requestRetries = parseInt(process.env.REQUEST_RETRIES) || 2;

custom.setHttpOptionsDefaults({
  timeout: requestTimeout,
  retry: requestRetries
});

/**
 * Exchange an authorization code for an access token with ACM/IDM as OpenId Provider
 *
 * @param {string} authorizationCode The authorization code to exchange for an access token
 *
 * @return {TokenSet} The token set received from ACM/IDM including the access token and claims
 *                    See also https://github.com/panva/node-openid-client/blob/main/docs/README.md#tokenset
 * @throw {Error} On failure to retrieve a valid access token from ACM/IDM
*/
const getAccessToken = async function (authorizationCode) {
  const issuer = await Issuer.discover(discoveryUrl);
  const client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret
  });

  try {
    return await client.callback(redirectUri, { code: authorizationCode });
  } catch (e) {
    console.log(`Error while retrieving access token from OpenId Provider: ${e}`);
    throw new Error(`Something went wrong while retrieving the access token: ${e}`);
  }
};

export { getAccessToken };
