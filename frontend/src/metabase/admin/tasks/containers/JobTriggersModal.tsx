import cx from "classnames";
import { useMemo } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useGetTasksInfoQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import type { Trigger } from "metabase-types/api";

const renderTriggersTable = (triggers: Trigger[] | undefined) => {
  return (
    <table className={cx(AdminS.ContentTable, CS.mt2)}>
      <thead>
        <tr>
          <th>{t`Key`}</th>
          <th>{t`Description`}</th>
          <th>{t`State`}</th>
          <th>{t`Priority`}</th>
          <th>{t`Last Fired`}</th>
          <th>{t`Next Fire Time`}</th>
          <th>{t`Start Time`}</th>
          <th>{t`End Time`}</th>
          <th>{t`Final Fire Time`}</th>
          <th>{t`May Fire Again?`}</th>
          <th>{t`Misfire Instruction`}</th>
        </tr>
      </thead>
      <tbody>
        {triggers &&
          triggers.map(trigger => (
            <tr key={trigger.key}>
              <td className={CS.textBold}>{trigger.key}</td>
              <td>{trigger.description}</td>
              <td>{trigger.state}</td>
              <td>{trigger.priority}</td>
              <td>{trigger["previous-fire-time"]}</td>
              <td>{trigger["next-fire-time"]}</td>
              <td>{trigger["start-time"]}</td>
              <td>{trigger["end-time"]}</td>
              <td>{trigger["final-fire-time"]}</td>
              <td>{trigger["may-fire-again?"] ? t`Yes` : t`No`}</td>
              <td>{trigger["misfire-instruction"]}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export const JobTriggersModal = (props: { params: { jobKey: string } }) => {
  const dispatch = useDispatch();
  const { data, error, isFetching } = useGetTasksInfoQuery();

  const { jobKey } = props.params;
  const job = useMemo(() => {
    const jobs = jobKey ? (data?.jobs ?? []) : [];
    return _.findWhere(jobs, { key: jobKey });
  }, [jobKey, data]);

  return (
    <ModalContent
      title={t`Triggers for ${jobKey}`}
      onClose={() => dispatch(goBack())}
    >
      <LoadingAndErrorWrapper loading={isFetching} error={error}>
        {() => renderTriggersTable(job?.triggers)}
      </LoadingAndErrorWrapper>
    </ModalContent>
  );
};
