import React, { Component } from "react";
import { Link } from "react-router";
import Icon from "metabase/components/Icon.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import { SetupApi } from "metabase/services";
import { t } from "c-3po";
import colors from "metabase/lib/colors";

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
      borderColor: completed ? colors["success"] : colors["text-light"],
      backgroundColor: completed ? colors["success"] : colors["text-white"],
      width: 32,
      height: 32,
      borderRadius: 99,
    }}
  >
    {completed && <Icon name="check" color={colors["text-white"]} />}
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
    );
  }
}
