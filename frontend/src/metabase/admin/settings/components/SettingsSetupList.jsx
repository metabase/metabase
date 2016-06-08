import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

const TaskList = ({tasks}) =>
  <ol>
    { tasks.map((task, index) => <li className="mb2" key={index}><Task {...task} /></li>)}
  </ol>

const TaskSectionHeader = ({name}) =>
  <h4 className="text-grey-4 text-bold text-uppercase pb2">{name}</h4>

const TaskSection = ({name, tasks}) =>
  <div className="mb4">
    <TaskSectionHeader name={name} />
    <TaskList tasks={tasks} />
  </div>

const TaskTitle = ({title, titleClassName}) =>
  <h3 className={titleClassName}>{title}</h3>

const TaskDescription = ({description}) => <p className="m0 mt1">{description}</p>

const CompletionBadge = ({completed}) =>
    <div className="mr2 flex align-center justify-center flex-no-shrink" style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: completed ? '#9CC177' : '#DCE9EA',
        backgroundColor: completed ? '#9CC177' : '#fff',
        width: 32,
        height: 32,
        borderRadius: 99
      }}>
      { completed && <Icon name="check" color={'#fff'} />}
    </div>


export const Task = ({title, description, completed, link}) =>
  <a className="bordered border-brand-hover rounded transition-border flex align-center p2 no-decoration" href={link}>
    <CompletionBadge completed={completed} />
    <div>
      <TaskTitle title={title} titleClassName={
          completed ? 'text-success': 'text-brand'
        } />
      { !completed ? <TaskDescription description={description} /> : null }
    </div>
  </a>

export default class SettingsSetupList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            tasks: null,
            error: null
        };
    }

    async componentWillMount() {
        let response = await fetch("/api/setup/admin_checklist", { credentials: 'same-origin' });
        if (response.status !== 200) {
            this.setState({ error: await response.json() })
        } else {
            this.setState({ tasks: await response.json() });
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
                })
            }))
        }

        return (
            <div className="px2">
              <h2>Getting set up</h2>
              <p className="mt1">A few things you can do to get the most out of Metabase.</p>
              <LoadingAndErrorWrapper loading={!this.state.tasks} error={this.state.error} >
              { () =>
                  <div style={{maxWidth: 468}}>
                      <TaskSection name="Recommended next step" tasks={[nextTask]} />
                      {
                        tasks.map((section, index) =>
                          <TaskSection {...section} key={index} />
                        )
                      }
                  </div>
              }
              </LoadingAndErrorWrapper>
            </div>
        );
    }
}
