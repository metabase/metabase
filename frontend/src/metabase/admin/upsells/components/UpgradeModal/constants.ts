// Features list shown in the upgrade modal
// TODO: Consider moving this to the API response
export const MOCK_DATA = {
  features: [
    "Whitelabeling",
    "Advanced Permissions",
    "Usage Analytics, and more",
  ],
};

export type ModalStep = "initial" | "loading" | "error";
export type UpgradeFlow = "trial" | "upgrade";
