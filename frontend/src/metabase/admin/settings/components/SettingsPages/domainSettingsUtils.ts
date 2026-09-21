import _ from "underscore";

import type { EnterpriseSettings } from "metabase-types/api";

export type DomainsSettings = Pick<
  EnterpriseSettings,
  "allowed-iframe-hosts" | "csp-img-enabled" | "csp-img-allowed-hosts"
>;

// BE settings code does not support empty strings, so we use " " as a sentinel for ""
const EMPTY_ALLOWED_IFRAME_HOSTS = " ";

export function isDomainSettingsDirty(
  initialValues: DomainsSettings,
  values: DomainsSettings,
) {
  return !_.isEqual(
    normalizeDomainSettings(initialValues),
    normalizeDomainSettings(values),
  );
}

export function normalizeDomainSettings(values: DomainsSettings) {
  return {
    "allowed-iframe-hosts": isEmptyString(values["allowed-iframe-hosts"])
      ? EMPTY_ALLOWED_IFRAME_HOSTS
      : values["allowed-iframe-hosts"],
    "csp-img-enabled": values["csp-img-enabled"],
    "csp-img-allowed-hosts": isEmptyString(values["csp-img-allowed-hosts"])
      ? ""
      : values["csp-img-allowed-hosts"],
  };
}

export function isEmptyString(value?: string | null) {
  return value == null || value.trim() === "";
}
