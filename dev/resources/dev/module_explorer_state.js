function encodeExplorerState(state) {
  const params = new URLSearchParams();
  if (state.selected) params.set('m', state.selected);
  if (state.view !== 'tree') params.set('view', state.view);
  if (state.focus.size) params.set('focus', [...state.focus].sort().join(','));
  else if (state.view === 'graph') params.set('focus', '');
  if (state.degree !== 1) params.set('deg', state.degree);
  if (state.expanded.size) params.set('exp', [...state.expanded].sort().join(','));
  if (state.hidden.size) params.set('hide', [...state.hidden].sort().join(','));
  if (state.hideRe) params.set('hre', state.hideRe);
  for (const team of [...state.teams].sort()) params.append('team', team);
  return params.toString();
}

function decodeExplorerState(hash, validIds, validTeams) {
  const raw = hash.replace(/^#/, '');
  const params = new URLSearchParams(raw.includes('=') ? raw : (raw ? 'm=' + raw : ''));
  const ids = key => (params.get(key) || '').split(',').filter(id => validIds.has(id));
  const requestedView = params.get('view');
  const requestedDegree = Number.parseInt(params.get('deg'), 10);
  const selected = validIds.has(params.get('m')) ? params.get('m') : null;
  return {
    selected,
    view: ['hotspots', 'graph'].includes(requestedView) ? requestedView : 'tree',
    focus: new Set(ids('focus')),
    focusSpecified: params.has('focus'),
    degree: Math.min(3, Math.max(1, requestedDegree || 1)),
    expanded: new Set(ids('exp')),
    hidden: new Set(ids('hide')),
    hideRe: params.get('hre') || '',
    teams: new Set(params.getAll('team').filter(team => validTeams.has(team))),
  };
}

if (typeof module === 'object' && module.exports) {
  module.exports = {decodeExplorerState, encodeExplorerState};
}
