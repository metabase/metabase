import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";

const TASK_LIST = [
  {
    name: 'Get connected',
    tasks: [
      {
        title: 'Connect to a database',
        description: 'test description',
        completed: true,
        link: ''
      },
      {
        title: 'Set up Slack',
        description: 'Does your team use Slack?  If so, you can send automated updates via pulses and  ask questions with Metabot',
        completed: false,
        link: ''
      },
      {
        title: 'Invite team members',
        description: 'test description',
        completed: true,
        link: ''
      }
    ]
  },
  {
    name: 'Curate data',
    tasks: [
      {
        title: 'Hide some irrelevant or technical tables',
        description: 'test description',
        completed: true,
        link: ''
      },
      {
        title: 'Create metrics',
        description: 'Keep everyone on the same page by creating canonnical sets of filters anyone can use  while  asking questions.',
        completed: false,
        link: ''
      }
    ]
  }
]

const TaskList = ({tasks}) =>
  <ol>
    { tasks.map((task, index) => <li className="mb2" key={index}><Task {...task} /></li>)}
  </ol>

const TaskSectionHeader = ({name}) =>
  <h4 className="text-grey-4 text-bold text-uppercase pb1">{name}</h4>

const TaskSection = ({name, tasks}) =>
  <div className="mb4">
    <TaskSectionHeader name={name} />
    <TaskList tasks={tasks} />
  </div>

const TaskTitle = ({title, titleClassName}) =>
  <h3 className={titleClassName}>{title}</h3>

const TaskDescription = ({description}) => <p className="m0">{description}</p>

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


const Task = ({title, description, completed}) =>
  <div className="bordered rounded flex align-center p2">
    <CompletionBadge completed={completed} />
    <div>
      <TaskTitle title={title} titleClassName={
          completed ? 'text-success': 'text-brand'
        } />
      { !completed ? <TaskDescription description={description} /> : null }
    </div>
  </div>

const SettingsSetupList = () =>
    <div className="px2">
      <h2>Getting set up</h2>
      <p>A few things you can do to get the most out of Metabase.</p>
      <div style={{maxWidth: 468}}>
          <TaskSection
            name="Recommended next step"
            tasks={[
              {
                title: 'Test 3',
                description: 'Do the 3rd test thing',
                completed: false,
                link: 'derp'
              }
            ]}
          />
          {
            TASK_LIST.map((section, index) =>
              <TaskSection {...section} key={index} />
            )
          }
      </div>
    </div>

export default SettingsSetupList
