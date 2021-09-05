import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';

const SESSION_GRAPH_URI = 'http://mu.semte.ch/graphs/sessions';
const PUBLIC_GRAPH_URI = 'http://mu.semte.ch/graphs/public';
const ORGANIZATION_GRAPH_BASE_URI = 'http://mu.semte.ch/graphs/organizations/';
const RESOURCE_BASE_URI = process.env.MU_APPLICATION_RESOURCE_BASE_URI || 'http://themis.vlaanderen.be/';

const serviceHomepage = 'https://github.com/kanselarij/press-releases-acmidm-login-service';
const personResourceBaseUri = `${RESOURCE_BASE_URI}id/persoon/`;
const accountResourceBaseUri = `${RESOURCE_BASE_URI}id/account/`;
const userGroupResourceBaseUri = `${RESOURCE_BASE_URI}id/gebruikersgroep/`;
const identifierResourceBaseUri = `${RESOURCE_BASE_URI}id/identificator/`;

const USER_ID_CLAIM = process.env.MU_APPLICATION_AUTH_USERID_CLAIM || 'vo_id';
const ACCOUNT_ID_CLAIM = process.env.MU_APPLICATION_AUTH_ACCOUNTID_CLAIM || 'vo_id';
const GROUP_ID_CLAIM = process.env.MU_APPLICATION_AUTH_GROUPID_CLAIM || 'vo_orgcode';

const removeOldSessions = async function (sessionUri) {
  await update(
    `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX session: <http://mu.semte.ch/vocabularies/session/>
     PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
     PREFIX dcterms: <http://purl.org/dc/terms/>

     DELETE WHERE {
       GRAPH <${SESSION_GRAPH_URI}> {
           ${sparqlEscapeUri(sessionUri)} session:account ?account ;
                                          mu:uuid ?id ;
                                          dcterms:modified ?modified ;
                                          ext:sessionRole ?role ;
                                          ext:sessionGroup ?group .
       }
     }`);
};

const removeCurrentSession = async function (sessionUri) {
  await removeOldSessions(sessionUri);
};

const ensureUserGroup = async function(claims) {
  // TODO fix once configuration has been changed at ACM/IDM.
  // We should receive only 1 organization for a logged in user.
  //  const groupIdentifier = claims[GROUP_ID_CLAIM];
  const groupIdentifier = claims['vo_orglijst'][0]?.split(':')[1];

  if (!groupIdentifier) {
    throw new Error('Cannot determine user-group from received claims');
  }

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    SELECT ?group ?groupId
    FROM <${PUBLIC_GRAPH_URI}> {
      ?group a foaf:Group ;
            mu:uuid ?groupId ;
            dcterms:identifier ${sparqlEscapeString(groupIdentifier)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { groupUri: result.group.value, groupId: result.groupId.value };
  } else {
    const { groupUri, groupId } = await insertNewUserGroup(groupIdentifier);
    return { groupUri, groupId };
  }
};

const insertNewUserGroup = async function(identifier) {
  const groupId = uuid();
  const group = `${userGroupResourceBaseUri}${groupId}`;
  const now = new Date();

  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX acmidm: <http://mu.semte.ch/vocabularies/ext/acmidm/>
    INSERT DATA {
      GRAPH <${PUBLIC_GRAPH_URI}> {
        ${sparqlEscapeUri(group)} a foaf:Group ;
                                 mu:uuid ${sparqlEscapeString(groupId)} ;
                                 dcterms:identifier ${sparqlEscapeString(identifier)} ;
                                 dcterms:created ${sparqlEscapeDateTime(now)} .
      }
    }
  `;

  await update(insertData);

  return { groupUri: group, groupId: groupId };
};

const ensureUserAndAccount = async function(claims, group) {
  const graph = `${ORGANIZATION_GRAPH_BASE_URI}${group.id}`;
  const { personUri } = await ensureUser(claims, group.uri, graph);
  const { accountUri, accountId } = await ensureAccountForUser(personUri, claims, graph);
  return { accountUri, accountId };
};

const ensureUser = async function(claims, groupUri, graph) {
  const userId = claims[USER_ID_CLAIM];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    SELECT ?person ?personId
    FROM <${graph}> {
      ?person a foaf:Person ;
            mu:uuid ?personId ;
            adms:identifier ?identifier .
      ?identifier skos:notation ${sparqlEscapeString(userId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { personUri: result.person.value, personId: result.personId.value };
  } else {
    const { personUri, personId } = await insertNewUser(claims, groupUri, graph);
    return { personUri, personId };
  }
};

const insertNewUser = async function(claims, groupUri, graph) {
  const personId = uuid();
  const person = `${personResourceBaseUri}${personId}`;
  const identifierId = uuid();
  const identifier = `${identifierResourceBaseUri}${identifierId}`;
  const now = new Date();

  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(person)} a foaf:Person ;
                                 mu:uuid ${sparqlEscapeString(personId)} ;
                                 adms:identifier ${sparqlEscapeUri(identifier)} ;
                                 foaf:member ${sparqlEscapeUri(groupUri)} .
        ${sparqlEscapeUri(identifier)} a adms:Identifier ;
                                       mu:uuid ${sparqlEscapeString(identifierId)} ;
                                       skos:notation ${sparqlEscapeString(claims[USER_ID_CLAIM])} .
    `;

  if (claims.given_name)
    insertData += `${sparqlEscapeUri(person)} foaf:firstName ${sparqlEscapeString(claims.given_name)} . \n`;

  if (claims.family_name)
    insertData += `${sparqlEscapeUri(person)} foaf:familyName ${sparqlEscapeString(claims.family_name)} . \n`;

  insertData += `
      }
    }
  `;

  await update(insertData);

  return { personUri: person, personId: personId };
};

const ensureAccountForUser = async function(personUri, claims, graph) {
  const accountId = claims[ACCOUNT_ID_CLAIM];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    SELECT ?account ?accountId
    FROM <${graph}> {
      ${sparqlEscapeUri(personUri)} foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(accountId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    const { accountUri, accountId } = await insertNewAccountForUser(personUri, claims, graph);
    return { accountUri, accountId };
  }
};


const insertNewAccountForUser = async function(person, claims, graph) {
  const accountId = uuid();
  const account = `${accountResourceBaseUri}${accountId}`;
  const now = new Date();

  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX acmidm: <http://mu.semte.ch/vocabularies/ext/acmidm/>
    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(person)} foaf:account ${sparqlEscapeUri(account)} .
        ${sparqlEscapeUri(account)} a foaf:OnlineAccount ;
                                 mu:uuid ${sparqlEscapeString(accountId)} ;
                                 foaf:accountServiceHomepage ${sparqlEscapeUri(serviceHomepage)} ;
                                 dcterms:identifier ${sparqlEscapeString(claims[ACCOUNT_ID_CLAIM])} ;
                                 dcterms:created ${sparqlEscapeDateTime(now)} .
    `;

  if (claims.vo_doelgroepcode)
    insertData += `${sparqlEscapeUri(account)} acmidm:doelgroepCode ${sparqlEscapeString(claims.vo_doelgroepcode)} . \n`;

  if (claims.vo_doelgroepnaam)
    insertData += `${sparqlEscapeUri(account)} acmidm:doelgroepNaam ${sparqlEscapeString(claims.vo_doelgroepnaam)} . \n`;

  insertData += `
      }
    }
  `;

  await update(insertData);

  return { accountUri: account, accountId: accountId };
};

const insertNewSessionForAccount = async function(accountUri, sessionUri, groupUri, roles = []) {
  const sessionId = uuid();
  const now = new Date();

  let insertData = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
        ${sparqlEscapeUri(sessionUri)} mu:uuid ${sparqlEscapeString(sessionId)} ;
                                 session:account ${sparqlEscapeUri(accountUri)} ;
                                 ext:sessionGroup ${sparqlEscapeUri(groupUri)} ;`;
  if (roles && roles.length)
    insertData += `
                                 ext:sessionRole ${roles.map(r => sparqlEscapeString(r)).join(', ')} ;
              `;

  insertData +=`                     dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }`;

  await update(insertData);
  return { sessionUri, sessionId };
};

const selectAccountBySession = async function(session) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    SELECT ?account ?accountId
    WHERE {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
          ${sparqlEscapeUri(session)} session:account ?account ;
                                      ext:sessionGroup ?group .
      }
      GRAPH <${PUBLIC_GRAPH_URI}> {
          ?group a foaf:Group ;
                 mu:uuid ?groupId .
      }
      GRAPH ?g {
          ?account a foaf:OnlineAccount ;
                   mu:uuid ?accountId .
      }
      FILTER(?g = IRI(CONCAT("${ORGANIZATION_GRAPH_BASE_URI}", ?groupId)))
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    return { accountUri: null, accountId: null };
  }
};

const selectCurrentSession = async function(account) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    SELECT ?session ?sessionId ?group ?groupId (GROUP_CONCAT(?role; SEPARATOR = ',') as ?roles)
    WHERE {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
          ?session session:account ${sparqlEscapeUri(account)} ;
                   mu:uuid ?sessionId ;
                   ext:sessionGroup ?group .
          OPTIONAL { ?session ext:sessionRole ?role . }
      }
      GRAPH <${PUBLIC_GRAPH_URI}> {
          ?group a foaf:Group ;
                 mu:uuid ?groupId .
      }
    } GROUP BY ?session ?sessionId ?group ?groupId`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      sessionUri: result.session.value,
      sessionId: result.sessionId.value,
      groupUri: result.group.value,
      groupId: result.groupId.value,
      roles: result.roles.value.split(',')
    };
  } else {
    return { sessionUri: null, sessionId: null, groupUri: null, groupId: null, roles: null };
  }
};

export {
  removeOldSessions,
  removeCurrentSession,
  ensureUserGroup,
  ensureUserAndAccount,
  insertNewSessionForAccount,
  selectAccountBySession,
  selectCurrentSession,
};
