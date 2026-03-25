import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  useMetabotAgent,
  useMetabotEnabledEmbeddingAware,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";
import { Button } from "metabase/ui";

import { trackQueryFixClicked } from "../../analytics";

export function FixSqlQueryButton() {
  const dispatch = useDispatch();
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const { submitInput, isDoingScience } = useMetabotAgent("sql");

  if (!isMetabotEnabled) {
    return null;
  }

  const handleClick = async () => {
    trackQueryFixClicked();
    await dispatch(setIsNativeEditorOpen(true));
    // SQL and error message are included in the context.
    await submitInput("Fix this SQL query");
  };

  return (
    <Button
      loading={isDoingScience}
      onClick={handleClick}
    >{t`Have Metabot fix it`}</Button>
  );
}
