require("babel-register");

const repl = require("repl");
const { JSDOM } = require("jsdom");
const Module = require("module");

const MODULE_ALIASES = Object.entries(
  require(__dirname + "/jest.integ.conf.json").moduleNameMapper,
).map(([regex, alias]) => [
  new RegExp(regex),
  alias.replace(/<rootDir>/, __dirname),
]);

// hook require to support aliases normally handled by webpack/jest
const Module_load = Module._load;
Module._load = function(request, parent) {
  for (const [regex, alias] of MODULE_ALIASES) {
    if (regex.test(request)) {
      return Module_load.call(this, alias, parent);
    }
  }
  return Module_load.call(this, request, parent);
};

// helper to copy properties from one object to another
function copyProps(src, target) {
  const props = {};
  for (const prop of Object.getOwnPropertyNames(src)) {
    if (target[prop] === undefined) {
      props[prop] = Object.getOwnPropertyDescriptor(src, prop);
    }
  }
  Object.defineProperties(target, props);
}

function bindSelectors(selectors, getState) {
  const boundSelectors = {};
  for (const name in selectors) {
    boundSelectors[name] = props => selectors[name](getState(), props);
  }
  return boundSelectors;
}

// set up browser environment

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = jsdom.window;
global.document = window.document;
global.navigator = { userAgent: "node.js", platform: "" };
copyProps(window, global);

require("./frontend/test/metabase-bootstrap.js");

// bleh, shouldn't try to call ga if not defined
global.ga = () => {};
require("metabase/lib/settings").default.set("version", {});

const { METABASE_SESSION_COOKIE } = require("metabase/lib/cookies");
const { Api } = require("metabase/lib/api");
// HACK: patch basename
Api.prototype.basename = process.env["MB_REPL_HOST"] || "http://localhost:3000";

// setup redux store
const { combineReducers, bindActionCreators } = require("redux");
const { getStore } = require("metabase/store");

global.store = getStore({
  entities: require("metabase/redux/entities").default,
  requests: require("metabase/redux/requests").default,
});

global.entities = require("metabase/entities");
for (const name in entities) {
  global[name] = {
    ...entities[name],
    ...bindActionCreators(entities[name].actions, store.dispatch),
    ...bindSelectors(entities[name].selectors, store.getState),
  };
}

// copy services to global
copyProps(require("metabase/services"), global);

global.login = (username, password) =>
  SessionApi.create({ username, password })
    .then(session => {
      Api.prototype.headers = {
        Cookie: `${METABASE_SESSION_COOKIE}=${session.id}`,
      };
      return UserApi.current();
    })
    .then(user => console.log("Logged in as:", user));

function startRepl() {
  repl.start("metabase> ");
}

if (process.env["MB_REPL_USER"]) {
  login(process.env["MB_REPL_USER"], process.env["MB_REPL_PASSWORD"])
    .then(startRepl)
    .catch(console.error);
} else {
  startRepl();
}
