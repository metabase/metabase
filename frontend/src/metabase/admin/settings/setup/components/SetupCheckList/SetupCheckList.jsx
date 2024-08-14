/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { UpsellHosting } from "metabase/admin/upsells";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { SetupApi } from "metabase/services";
import { Box, Flex, Icon } from "metabase/ui";

import {
  SetupListRoot,
  TaskRegularLink,
  TaskExternalLink,
} from "./SetupCheckList.styled";

const TaskList = ({ tasks }) => (
  <ol>
    {tasks.map((task, index) => (
      <li className={CS.mb2} key={index}>
        <Task {...task} />
      </li>
    ))}
  </ol>
);

const TaskSectionHeader = ({ name }) => (
  <h4 className={cx(CS.textMedium, CS.textBold, CS.textUppercase, CS.pb2)}>
    {name}
  </h4>
);

const TaskSection = ({ name, tasks }) => (
  <div className={CS.mb4}>
    <TaskSectionHeader name={name} />
    <TaskList tasks={tasks} />
  </div>
);

const TaskTitle = ({ title, titleClassName }) => (
  <h3 className={titleClassName}>{title}</h3>
);

const TaskDescription = ({ description }) => (
  <p className={cx(CS.m0, CS.mt1)}>{description}</p>
);

const CompletionBadge = ({ completed }) => (
  <div
    className={cx(
      CS.mr2,
      CS.flex,
      CS.alignCenter,
      CS.justifyCenter,
      CS.flexNoShrink,
    )}
    style={{
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: completed ? color("success") : color("text-light"),
      backgroundColor: completed ? color("success") : color("text-white"),
      width: 32,
      height: 32,
      borderRadius: 99,
    }}
  >
    {completed && <Icon name="check" color={color("text-white")} />}
  </div>
);

const Task = ({ title, description, completed, link }) => (
  <TaskLink link={link}>
    <CompletionBadge completed={completed} />
    <div>
      <TaskTitle
        title={title}
        titleClassName={completed ? CS.textSuccess : CS.textBrand}
      />
      {!completed ? <TaskDescription description={description} /> : null}
    </div>
  </TaskLink>
);

const TaskLink = ({ link, children }) =>
  isSameOrSiteUrlOrigin(link) ? (
    <TaskRegularLink to={link}>{children}</TaskRegularLink>
  ) : (
    <TaskExternalLink href={link}>{children}</TaskExternalLink>
  );

class SetupCheckList extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      tasks: null,
      error: null,
    };
  }

  async componentDidMount() {
    try {
      const tasks = await SetupApi.admin_checklist();
      this.setState({ tasks });
    } catch (e) {
      this.setState({ error: e });
    }
  }

  render() {
    let tasks, nextTask;
    if (this.state.tasks) {
      tasks = this.state.tasks.map(section => ({
        ...section,
        tasks: section.tasks.filter(task => {
          if (task.is_next_step) {
            nextTask = task;
          }
          return !task.is_next_step;
        }),
      }));
    }

    return (
      <Flex justify="space-between">
        <SetupListRoot>
          <div className={CS.px2}>
            <h2>{t`Getting set up`}</h2>
            <p
              className={CS.mt1}
            >{t`A few things you can do to get the most out of Metabase.`}</p>
            <LoadingAndErrorWrapper
              loading={!this.state.tasks}
              error={this.state.error}
            >
              {() => (
                <div style={{ maxWidth: 468 }}>
                  {nextTask && (
                    <TaskSection
                      name={t`Recommended next step`}
                      tasks={[nextTask]}
                    />
                  )}
                  {tasks.map((section, index) => (
                    <TaskSection {...section} key={index} />
                  ))}
                </div>
              )}
            </LoadingAndErrorWrapper>
          </div>
        </SetupListRoot>
        <Box>
          <UpsellHosting source="settings-setup-migrate_to_cloud" />
        </Box>
      </Flex>
    );
  }
}

const mapStateToProps = state => ({
  isPaidPlan: getIsPaidPlan(state),
});

export default connect(mapStateToProps)(SetupCheckList);
