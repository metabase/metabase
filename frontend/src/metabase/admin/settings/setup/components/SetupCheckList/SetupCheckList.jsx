/* eslint-disable react/prop-types */
import { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import { SetupApi } from "metabase/services";
import { color } from "metabase/lib/colors";
import MetabaseSettings from "metabase/lib/settings";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";

import Icon from "metabase/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import MarginHostingCTA from "metabase/admin/settings/components/widgets/MarginHostingCTA";
import { SetupListRoot } from "./SetupCheckList.styled";

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

const Task = ({ title, description, completed, link }) => (
  <TaskLink
    link={link}
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
  </TaskLink>
);

const TaskLink = ({ className, link, children }) =>
  isSameOrSiteUrlOrigin(link) ? (
    <Link className={className} to={link}>
      {children}
    </Link>
  ) : (
    <ExternalLink className={className} href={link}>
      {children}
    </ExternalLink>
  );

export default class SetupCheckList extends Component {
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
      <SetupListRoot>
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

        {!MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise() && (
          <MarginHostingCTA tagline={t`Have your server maintained for you.`} />
        )}
      </SetupListRoot>
    );
  }
}
