import { t } from "ttag";

import type { DataSensitivity } from "metabase-types/api";

export function getDataSensitivityLabel(value: DataSensitivity): string {
  switch (value) {
    case "SEC_KEY":
      return t`Secrets and credentials`;
    case "SYS_TELEMETRY":
      return t`System telemetry`;
    case "PHI":
      return t`Health information`;
    case "BIO_GEN":
      return t`Biometric and genetic data`;
    case "PCI_FIN":
      return t`Financial and payment card data`;
    case "SENS_PERS":
      return t`Sensitive personal traits`;
    case "PII":
      return t`Personal information`;
    case "CORP_IP":
      return t`Intellectual property`;
    case "BIZ_CONF":
      return t`Confidential business data`;
    case "PUBLIC":
      return t`Public`;
  }
}
