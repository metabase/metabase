import React, { Component } from "react";
import { Link } from "react-router";
import { Flex } from "grid-styled";
import { SetupApi } from "metabase/services";
import { t } from "ttag";
import { color } from "metabase/lib/colors";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Text from "metabase/components/type/Text";

const TaskList = ({ tasks }) => (
  <ol>
    {tasks.map((task, index) => (
      <li className="mb2" key={index}>
        <Task {...task} />
      </li>
    ))}
  </ol>
);

const TaskSectionHeader = ({ name }) => (
  <h4 className="text-medium text-bold text-uppercase pb2">{name}</h4>
);

const TaskSection = ({ name, tasks }) => (
  <div className="mb4">
    <TaskSectionHeader name={name} />
    <TaskList tasks={tasks} />
  </div>
);

const TaskTitle = ({ title, titleClassName }) => (
  <h3 className={titleClassName}>{title}</h3>
);

const TaskDescription = ({ description }) => (
  <p className="m0 mt1">{description}</p>
);

const CompletionBadge = ({ completed }) => (
  <div
    className="mr2 flex align-center justify-center flex-no-shrink"
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

export const Task = ({ title, description, completed, link }) => (
  <Link
    to={link}
    className="bordered border-brand-hover rounded transition-border flex align-center p2 no-decoration"
  >
    <CompletionBadge completed={completed} />
    <div>
      <TaskTitle
        title={title}
        titleClassName={completed ? "text-success" : "text-brand"}
      />
      {!completed ? <TaskDescription description={description} /> : null}
    </div>
  </Link>
);

export default class SettingsSetupList extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      tasks: null,
      error: null,
    };
  }

  async componentWillMount() {
    try {
      const tasks = await SetupApi.admin_checklist();
      this.setState({ tasks: tasks });
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
      <Flex justifyContent="space-between">
        <div className="px2">
          <h2>{t`Getting set up`}</h2>
          <p className="mt1">{t`A few things you can do to get the most out of Metabase.`}</p>
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
        <div
          className="border-left border-brand text-brand px4"
          style={{ height: 172 }}
        >
          <Icon name="cloud" size={48} style={{ color: "#B9D8F4" }} />
          <div className="pb3">
            <Text className="text-brand mb0">{t`Have your server maintained for you.`}</Text>
            <Text className="text-brand text-bold">{t`Migrate to Metabase Cloud.`}</Text>
          </div>

          <ExternalLink
            className="bordered rounded border-brand bg-brand-hover text-white-hover px2 py1 text-bold text-center"
            href={"https://www.metabase.com/migrate/from/selfhosted"}
            target="_blank"
          >
            {t`Learn more`}
          </ExternalLink>
        </div>
      </Flex>
    );
  }
}
