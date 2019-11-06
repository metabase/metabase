import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";

import { fetchJobInfo } from "../jobInfo";

const renderTriggersTable = triggers => {
  return (
    <table className="ContentTable mt2">
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
              <td className="text-bold">{trigger.key}</td>
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

@connect(
  null,
  { fetchJobInfo, goBack },
)
export default class JobTriggersModal extends React.Component {
  state = {
    triggers: null,
    error: null,
  };

  async componentDidMount() {
    try {
      const { jobKey } = this.props.params;
      const jobs = jobKey && (await this.props.fetchJobInfo()).payload.jobs;
      const job = jobs && _.findWhere(jobs, { key: jobKey });
      const triggers = (job && job.triggers) || [];

      this.setState({ triggers, error: null });
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const {
      params: { jobKey },
      goBack,
    } = this.props;
    const { triggers, error } = this.state;

    return (
      <ModalContent title={t`Triggers for ${jobKey}`} onClose={goBack}>
        <LoadingAndErrorWrapper loading={!triggers} error={error}>
          {() => renderTriggersTable(triggers)}
        </LoadingAndErrorWrapper>
      </ModalContent>
    );
  }
}
