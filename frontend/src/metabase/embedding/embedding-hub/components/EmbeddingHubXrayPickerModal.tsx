import cx from "classnames";
import { dissoc } from "icepick";
import { t } from "ttag";

import { Api, dashboardApi, useLazyGetXrayDashboardQuery } from "metabase/api";
import { invalidateTags, listTag } from "metabase/api/tags";
import { Link } from "metabase/common/components/Link";
import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
}: EmbeddingHubXrayPickerModalProps) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [fetchXrayDashboard] = useLazyGetXrayDashboardQuery();

  async function handleTableSelect(tableId: TableId) {
    onClose();

    try {
      const xrayDashboard = await fetchXrayDashboard({
        subPath: `table/${tableId}`,
      }).unwrap();

      const { data: savedDashboard } = await dispatch(
        dashboardApi.endpoints.saveDashboard.initiate(
          dissoc(xrayDashboard, "id"),
        ),
      );

      if (!savedDashboard) {
        throw new Error("Failed to save x-ray dashboard");
      }

      dispatch(
        Api.util.invalidateTags([
          ...invalidateTags(null, ["collection"]),
          listTag("embedding-hub-checklist"),
        ]),
      );

      const savedDashboardUrl = Urls.dashboard(savedDashboard);
      sendToast({
        message: (
          <div className={cx(CS.flex, CS.alignCenter)}>
            {t`Your dashboard was saved`}
            <Link
              className={cx(CS.link, CS.textBold, CS.ml1)}
              to={savedDashboardUrl}
            >
              {t`See it`}
            </Link>
          </div>
        ),
        icon: "dashboard",
      });
    } catch {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`Failed to create dashboard`,
      });
    }
  }

  if (!opened) {
    return null;
  }

  return (
    <DataPickerModal
      title={t`Choose a table to generate a dashboard`}
      models={["table"]}
      onChange={handleTableSelect}
      onClose={onClose}
      options={{
        hasLibrary: false,
        hasRootCollection: false,
        hasPersonalCollections: false,
      }}
    />
  );
};
