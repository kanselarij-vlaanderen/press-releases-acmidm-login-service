/**
 * Get the session ID from the request headers
 *
 * @return {string} The session ID from the request headers
*/
const getSessionIdHeader = function (request) {
  return request.get('mu-session-id');
};

/**
 * Get the rewrite URL from the request headers
 *
 * @return {string} The rewrite URL from the request headers
*/
const getRewriteUrlHeader = function (request) {
  return request.get('x-rewrite-url');
};

export {
  getSessionIdHeader,
  getRewriteUrlHeader
};
