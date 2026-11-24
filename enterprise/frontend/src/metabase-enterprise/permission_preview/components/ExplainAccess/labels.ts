import { t } from "ttag";

export function getCollectionValueLabel(value: string) {
  switch (value) {
    case "curate":
      return t`Curate`;
    case "view":
      return t`View`;
    default:
      return t`No access`;
  }
}

export function getViewDataLabel(value: string) {
  switch (value) {
    case "unrestricted":
      return t`Can view`;
    case "legacy-no-self-service":
      return t`Can view, no self-service`;
    default:
      return t`Blocked`;
  }
}

export function getCreateQueriesLabel(value: string) {
  switch (value) {
    case "query-builder-and-native":
      return t`Query builder and native`;
    case "query-builder":
      return t`Query builder only`;
    default:
      return t`No query access`;
  }
}

export function getDownloadLabel(value: string) {
  switch (value) {
    case "one-million-rows":
      return t`Up to 1 million rows`;
    case "ten-thousand-rows":
      return t`Up to 10,000 rows`;
    default:
      return t`No downloads`;
  }
}
