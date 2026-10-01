// Jest compiles imports lazily (see jest.base.conf.js), so a module runs the
// first time a test reads one of its bindings. The modules below must run
// before any test instead, so import them here, at the top level.

// They register jest hooks when they run, and jest rejects a hook registered
// once the run has started.
import "@testing-library/react";
import "@testing-library/user-event";

// leaflet-draw reads `window.L`, which leaflet sets when it runs. The app
// imports leaflet-draw before leaflet and relies on leaflet having run
// earlier, which no longer happens on its own.
import "leaflet";

// It snapshots `window.MetabaseBootstrap` when it runs. Specs expect the
// bootstrap from `metabase-bootstrap.js`, not the one the core `beforeEach`
// merges mock settings into.
import "metabase/utils/settings";
