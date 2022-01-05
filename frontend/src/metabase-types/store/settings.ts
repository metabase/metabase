export interface SettingsState {
  values: Record<string, unknown>;
}

export const createSettingsState = (
  opts?: Partial<SettingsState>,
): SettingsState => ({
  values: {},
  ...opts,
});
