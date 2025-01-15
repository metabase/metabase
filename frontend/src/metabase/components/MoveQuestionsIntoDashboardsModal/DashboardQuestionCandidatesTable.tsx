import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Flex, Icon } from "metabase/ui";

import S from "./DashboardQuestionCandidatesTable.module.css";

export const DashboardQuestionCandidatesTable = ({
  data,
}: {
  data: Array<any>;
}) => {
  const rows = useMemo(
    () =>
      data.map((_, i) => ({
        id: i,
        questionName: `Question ${i}`,
        dashboardName: `Dashboard ${i}`,
      })),
    [data],
  );

  return (
    <div className={S.table}>
      <div>
        <div className={S.tr}>
          <div className={S.th}>
            <Flex gap="sm" align="center">
              <Icon name="folder" c="brand" />
              {t`Saved Question`}
            </Flex>
          </div>
          <div className={S.th}>
            <Flex gap="sm" align="center">
              <Icon name="dashboard" c="brand" />
              {t`Dashboard it'll be moved to`}
            </Flex>
          </div>
        </div>
      </div>
      <div className={S.tbody}>
        {rows.map(row => (
          <div key={row.id} className={S.tr}>
            <div className={S.col}>{row.questionName}</div>
            <div className={S.col}>{row.dashboardName}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
