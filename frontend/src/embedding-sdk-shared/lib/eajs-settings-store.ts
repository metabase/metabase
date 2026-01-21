export type EAJSSettings = {
  enableInternalNavigation: boolean;
};

// Temporary store until we figure out how to unify the props passed to the MetabaseProvider from the package
// and the parameters used in EAJS, which doesn't use MetabaseProvider component at all.
export const EAJSSettingsStore = {
  state: {
    enableInternalNavigation: false,
  } as EAJSSettings,

  setState(state: EAJSSettings) {
    this.state = state;
  },

  getState(): EAJSSettings {
    return this.state;
  },
};
