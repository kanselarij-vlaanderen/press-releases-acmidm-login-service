# Press releases ACM/IDM login microservice
Microservice running on [mu.semte.ch](http://mu.semte.ch) providing the necessary endpoints to login/logout a user using ACM/IDM as OpenId provider in the Vlivia application. This backend service works together with `@lblod/ember-acmidm-login` in the frontend.

This service is greatly inspired by [lblod/acmidm-login-service](https://github.com/lblod/acmidm-login-service) and [the Kaleidos login service](https://github.com/kanselarij-vlaanderen/acmidm-login-service).

## Tutorials
### Add the login service to a stack
Add the following snippet to your `docker-compose.yml` to include the login service in your project.

```yaml
services:
  login:
    image: kanselarij/press-releases-acmidm-login-service:0.1.0
    environment:
      MU_APPLICATION_AUTH_DISCOVERY_URL: "https://authenticatie-ti.vlaanderen.be/op"
      MU_APPLICATION_AUTH_CLIENT_ID: "my-client-id"
      MU_APPLICATION_AUTH_REDIRECT_URI: "https://VLIVIA-dev.vlaanderen.be/authorization/callback"
      MU_APPLICATION_AUTH_CLIENT_SECRET: "THIS IS OUR SECRET"
```

Add rules to the `dispatcher.ex` to dispatch requests to the login service. E.g.

```elixir
  match "/sessions/*path", @json do
    forward conn, path, "http://login/sessions/"
  end
```
The host `login` in the forward URL reflects the name of the login service in the `docker-compose.yml` file as defined above.

More information how to setup a mu.semte.ch project can be found in [mu-project](https://github.com/mu-semtech/mu-project).

## Refererence
### Configuration
The following environment variables are required:
* `MU_APPLICATION_AUTH_DISCOVERY_URL` [string]: OpenId discovery URL for authentication
* `MU_APPLICATION_AUTH_CLIENT_ID` [string]: Client id of the application in ACM/IDM
* `MU_APPLICATION_AUTH_CLIENT_SECRET` [string]: Client secret of the application in ACM/IDM
* `MU_APPLICATION_AUTH_REDIRECT_URI` [string]: Redirect URI of the application configured in ACM/IDM

The following enviroment variables can optionally be configured:
* `REQUEST_TIMEOUT` [int]: Timeout in ms of OpenID HTTP requests (default `25000`)
* `REQUEST_RETRIES` [int]: Number of times to retry OpenID HTTP requests (default `2`)
* `MU_APPLICATION_RESOURCE_BASE_URI` [string]: Base URI to use for resources created by this service. The URI must end with a trailing slash! (default: `http://themis.vlaanderen.be/`)
* `MU_APPLICATION_AUTH_USERID_CLAIM` [string]: Key of the claim that contains the user's identifier (default `vo_id`)
* `MU_APPLICATION_AUTH_ACCOUNTID_CLAIM` [string]: Key of the claim that contains the account's identifier (default `vo_id`)
* `MU_APPLICATION_AUTH_GROUPID_CLAIM` [string]: Key of the claim that contains the identifier for the user's group (default `vo_orgcode`)
* `DEBUG_LOG_TOKENSETS`: When set, received tokenSet information is logged to the console.


### API

#### POST /sessions
Log the user in by creating a new session, i.e. attaching the user's account to a session.

Before creating a new session, the given authorization code gets exchanged for an access token with an OpenID Provider (ACM/IDM) using the configured discovery URL. The returned JWT access token is decoded to retrieve information to attach to the user, account, user-group and the session. If the OpenID Provider returns a valid access token, a new user-group, user and account are created if they don't exist yet. The user is linked to the user-group; both the user-group and account are attached to the session.

The service handles the following claims included in the access token. Only the claims configured through the environment variables are required. All other claims are optional.
* `env.MU_APPLICATION_AUTH_USERID_CLAIM`<sup>1</sup>
* `given_name`<sup>1</sup>
* `family_name`<sup>1</sup>
* `env.MU_APPLICATION_AUTH_ACCOUNTID_CLAIM`<sup>2</sup>
* `vo_doelgroepcode`<sup>2</sup>
* `vo_doelgroepnaam`<sup>2</sup>
* `env.MU_APPLICATION_AUTH_GROUPID_CLAIM`<sup>3</sup>

<sup>1</sup>Information is attached to the user object in the store

<sup>2</sup> Information is attached to the account object in the store

<sup>3</sup> Information is attached to the session in the store

##### Request body
```javascript
{ authorizationCode: "secret" }
```

##### Response
###### 201 Created
On successful login with the newly created session in the response body:

```javascript
{
  "links": {
    "self": "sessions/current"
  },
  "data": {
    "type": "sessions",
    "id": "b178ba66-206e-4551-b41e-4a46983912c0",
    "attributes": {

    }
  },
  "relationships": {
    "account": {
      "links": {
        "related": "/accounts/f6419af0-c90f-465f-9333-e993c43e6cf2"
      },
      "data": {
        "type": "accounts",
        "id": "f6419af0-c90f-465f-9333-e993c43e6cf2"
      }
    },
    "group": {
      "links": {
        "related": "/user-groups/f6419af0-c60f-465f-9333-e993c43e6ch5"
      },
      "data": {
        "type": "user-groups",
        "id": "f6419af0-c60f-465f-9333-e993c43e6ch5"
      }
    }
  }
}
```

###### 400 Bad Request
- if session header is missing. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).
- if the authorization code is missing

###### 401 Bad Request
- on login failure. I.e. failure to exchange the authorization code for a valid access token with ACM/IDM

#### DELETE /sessions/current
Log out the current user, i.e. remove the session associated with the current user's account.

##### Response
###### 204 No Content
On successful logout

###### 400 Bad Request
If session header is missing or invalid. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).

#### GET /sessions/current
Get the current session

##### Response
###### 200 Created

```javascript
{
  "links": {
    "self": "sessions/current"
  },
  "data": {
    "type": "sessions",
    "id": "b178ba66-206e-4551-b41e-4a46983912c0",
    "attributes": {

    }
  },
  "relationships": {
    "account": {
      "links": {
        "related": "/accounts/f6419af0-c90f-465f-9333-e993c43e6cf2"
      },
      "data": {
        "type": "accounts",
        "id": "f6419af0-c90f-465f-9333-e993c43e6cf2"
      }
    },
    "group": {
      "links": {
        "related": "/user-groups/f6419af0-c60f-465f-9333-e993c43e6ch5"
      },
      "data": {
        "type": "user-groups",
        "id": "f6419af0-c60f-465f-9333-e993c43e6ch5"
      }
    }
  }
}
```

###### 400 Bad Request
If session header is missing or invalid. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).
