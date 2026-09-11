'use strict';

const assert = require('node:assert/strict');
const {
  decodeExplorerState,
  encodeExplorerState,
} = require('../../../dev/resources/dev/module_explorer_state.js');

const validIds = new Set(['core', 'lib']);
const validTeams = new Set(['DevEx', 'Querying']);

const encoded = encodeExplorerState({
  selected: 'core',
  view: 'graph',
  focus: new Set(),
  degree: 2,
  expanded: new Set(['core']),
  hidden: new Set(['lib']),
  hideRe: 'enterprise/',
  teams: new Set(['Querying', 'DevEx']),
});
const decoded = decodeExplorerState('#' + encoded, validIds, validTeams);

assert.equal(decoded.selected, 'core');
assert.equal(decoded.view, 'graph');
assert.deepEqual(decoded.focus, new Set());
assert.equal(decoded.focusSpecified, true);
assert.equal(decoded.degree, 2);
assert.deepEqual(decoded.expanded, new Set(['core']));
assert.deepEqual(decoded.hidden, new Set(['lib']));
assert.equal(decoded.hideRe, 'enterprise/');
assert.deepEqual(decoded.teams, new Set(['DevEx', 'Querying']));

const legacy = decodeExplorerState('#m=core&view=graph', validIds, validTeams);
assert.equal(legacy.focusSpecified, false);

const invalid = decodeExplorerState('#m=unknown&focus=core,unknown&team=Unknown', validIds, validTeams);
assert.equal(invalid.selected, null);
assert.deepEqual(invalid.focus, new Set(['core']));
assert.deepEqual(invalid.teams, new Set());
