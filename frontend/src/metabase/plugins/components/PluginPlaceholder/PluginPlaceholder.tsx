import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
interface Props {
  [key: string]: any;
}

export function PluginPlaceholder(_props: Props): JSX.Element | null {
  return null;
}

export function NotFoundPlaceholder(_props: Props): JSX.Element | null {
  return (
    <EmptyState
      illustrationElement={<img src={NoResults} />}
      title={t`We're a little lost...`}
      message={t`The page you asked for couldn't be found.`}
    />
  );
}
