/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import AdminHeader from "metabase/components/AdminHeader";
import Link from "metabase/core/components/Link";

import { fetchJobInfo } from "../jobInfo";
import {
  JobInfoHeader,
  JobInfoRoot,
  JobSchedulerInfo,
} from "./JobInfoApp.styled";

const renderSchedulerInfo = scheduler => {
  return (
    scheduler && (
      <JobSchedulerInfo>
        <pre>{scheduler.join("\n")}</pre>
      </JobSchedulerInfo>
    )
  );
};

const renderJobsTable = jobs => {
  return (
    jobs && (
      <table className="ContentTable mt2">
        <thead>
          <tr>
            <th>{t`Key`}</th>
            <th>{t`Class`}</th>
            <th>{t`Description`}</th>
            <th>{t`Triggers`}</th>
          </tr>
        </thead>
        <tbody>
          {jobs &&
            jobs.map(job => (
              <tr key={job.key}>
                <td className="text-bold">{job.key}</td>
                <td>{job.class}</td>
                <td>{job.description}</td>
                <td>{job.durable}</td>
                <td>
                  <Link
                    className="link"
                    to={`/admin/troubleshooting/jobs/${job.key}`}
                  >
                    {t`View triggers`}
                  </Link>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    )
  );
};

class JobInfoApp extends React.Component {
  async componentDidMount() {
    try {
      const info = (await this.props.fetchJobInfo()).payload;
      this.setState({
        scheduler: info.scheduler,
        jobs: info.jobs,
        error: null,
      });
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const { children } = this.props;
    const { error, scheduler, jobs } = this.state || {};

    return (
      <LoadingAndErrorWrapper loading={!scheduler} error={error}>
        <JobInfoRoot>
          <JobInfoHeader>
            <AdminHeader title={t`Scheduler Info`} />
          </JobInfoHeader>
          {renderSchedulerInfo(scheduler)}
          {renderJobsTable(jobs)}
          {
            // render 'children' so that the invididual task modals show up
            children
          }
        </JobInfoRoot>
      </LoadingAndErrorWrapper>
    );
  }
}

export default connect(null, { fetchJobInfo })(JobInfoApp);
