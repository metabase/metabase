import { t } from "ttag";

import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";
import { Button } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { trackQueryFixClicked } from "../../analytics";

export function FixSqlQueryButton() {
  const dispatch = useDispatch();
  const { canUseSqlGeneration } = useUserMetabotPermissions();
  const metabotName = useMetabotName();
  const { submitInput, isDoingScience } = useMetabotAgent("sql");

  if (!canUseSqlGeneration) {
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
    >{t`Have ${metabotName} fix it`}</Button>
  );
}
