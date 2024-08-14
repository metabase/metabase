import type {
  InviteInfo,
  Locale,
  SetupState,
  SubscribeInfo,
  UserInfo,
} from "metabase-types/store";

export const createMockLocale = (opts?: Partial<Locale>): Locale => ({
  name: "English",
  code: "en",
  ...opts,
});

export const createMockUserInfo = (opts?: Partial<UserInfo>): UserInfo => ({
  first_name: "Test",
  last_name: "Testy",
  email: "testy@metabase.test",
  site_name: "Epic Team",
  password: "",
  password_confirm: "",
  ...opts,
});

export const createMockInviteInfo = (
  opts?: Partial<InviteInfo>,
): InviteInfo => ({
  first_name: "Test",
  last_name: "Testy",
  email: "testy@metabase.test",
  ...opts,
});

export const createMockSubscribeInfo = (
  opts?: Partial<SubscribeInfo>,
): SubscribeInfo => ({
  email: "testy@metabase.test",
  ...opts,
});

export const createMockSetupState = (
  opts?: Partial<SetupState>,
): SetupState => ({
  step: "welcome",
  isLocaleLoaded: false,
  isTrackingAllowed: true,
  ...opts,
});
