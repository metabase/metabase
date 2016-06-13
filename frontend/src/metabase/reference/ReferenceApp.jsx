import React, { Component } from "react";
import { Link } from "react-router"
import { Flex } from "react-manhattan";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";
import Icon from "metabase/components/Icon.jsx";
import { Block } from "react-manhattan";
import { singularize } from "metabase/lib/formatting";

import { SIDEBAR_ITEMS } from "./fixture_data.delete.js";

export const Text = ({children}) =>
  <Measure><p>{children}</p></Measure>

export const Measure = ({children}) =>
  <Block maxWidth="32rem">{children}</Block>

const Bold = ({children}) => <b>{children}</b>

export const ReferenceEntitySideBarItem = ({href, icon, name}) =>
    <li>
      <Link to={href} className="block text-brand link px4 py2 bg-brand-hover text-white-hover">
        <ItemWithIcon icon={icon}>
            <Bold>{name}</Bold>
        </ItemWithIcon>
      </Link>
    </li>

export const ReferenceEntitySidebar = ({items}) =>
    <ul className="bg-light-blue border-right pt4">
        { items.map((item, index) =>
            <ReferenceEntitySideBarItem {...item} key={index} />)
        }
    </ul>

export const ItemWithIcon = ({children, icon}) =>
  <Flex alignItems="center">
    <Icon name={icon.name} className="text-light-blue mr1"/>
    {children}
  </Flex>

class ReferenceApp extends Component {
    renderSidebar () {
      const { entity, id } = this.props.params
      if (id) {
        return (
          <ul>
            <li>
              <ReferenceEntitySideBarItem
                name='Details'
                icon={{
                  name: 'chevrondown'
                }}
                href={`/reference/${entity}/${id}/details`}
              />
            </li>
            { singularize(entity) === 'list' ?
              <li>
                <ReferenceEntitySideBarItem
                  name={`Fields in this ${singularize(entity)}`}
                  icon={{
                    name: 'chevrondown'
                  }}
                  href={`/reference/${entity}/${id}/fields`}
                />
              </li>
             : null}
            <li>
              <ReferenceEntitySideBarItem
                name={`Questions based on this ${singularize(entity)}`}
                icon={{
                  name: 'chevrondown'
                }}
                href={`/reference/${entity}/${id}/questions`}
              />
            </li>
            <li>
              <ReferenceEntitySideBarItem
                name='Revision history'
                icon={{
                  name: 'history'
                }}
                href={`/reference/${entity}/${id}/revisions`}
              />
            </li>
          </ul>
        )
      } else {
        return <ReferenceEntitySidebar items={SIDEBAR_ITEMS}/>
      }
    }
    render () {
      const { children } = this.props
      return (
        <SidebarLayout sidebar={this.renderSidebar()}>
            <div className="wrapper">{children}</div>
        </SidebarLayout>
      )
    }
}

export default ReferenceApp
