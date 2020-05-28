import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { Box, Flex } from "grid-styled";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import AdminHeader from "metabase/components/AdminHeader";
import Link from "metabase/components/Link";

import { fetchJobInfo } from "../jobInfo";

const renderSchedulerInfo = scheduler => {
  return (
    scheduler && (
      <Flex align="center">
        <pre>{scheduler.join("\n")}</pre>
      </Flex>
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

@connect(
  null,
  { fetchJobInfo },
)
export default class JobInfoApp extends React.Component {
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
        <Box p={3}>
          <Flex align="center">
            <AdminHeader title={t`Scheduler Info`} />
          </Flex>
          {renderSchedulerInfo(scheduler)}
          {renderJobsTable(jobs)}
          {
            // render 'children' so that the invididual task modals show up
            children
          }
        </Box>
      </LoadingAndErrorWrapper>
    );
  }
}
