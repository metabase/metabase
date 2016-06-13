import React, { Component } from "react";
import { Link } from "react-router";
import { Flex, Block } from "react-manhattan";
import { singularize } from "metabase/lib/formatting";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";

import { ItemWithIcon, Text, Measure } from "../ReferenceApp.jsx";

import { INSIGHTS } from "../fixture_data.delete.js";

const AdditionalInfoItem = ({children, icon, href}) =>
  <Link to={href} className="block link mb1 border-bottom py2">
    <ItemWithIcon
      icon={{
        name: icon.name
      }}
    >
      {children}
      <IconBorder className="ml-auto">
        <Icon name="chevronright"/>
      </IconBorder>
    </ItemWithIcon>
  </Link>

const AdditionalMetricInfo = () =>
  <Block>
    <Block className="mb2">
      <h3>Most useful fields to group this metric by</h3>
      <MetricFields fields={INSIGHTS} />
    </Block>

    <Block>
      <h3>Other fields you can group this metric by</h3>
      <MetricFields fields={INSIGHTS} />
    </Block>
  </Block>


const MetricField = ({name, icon, href}) =>
  <Measure>
    <AdditionalInfoItem icon={icon} href={'/'}>{name}</AdditionalInfoItem>
  </Measure>

const MetricFields = ({fields}) =>
  <Block>
    { fields.map((f, i) => <MetricField {...f} key={i} />) }
  </Block>

const ReferenceEntityDetail = ({title, detail}) =>
  <Block>
    <h3>{title}</h3>
    <Measure>
      <p>{detail}</p>
    </Measure>
  </Block>

const MetricCalculation = () =>
  <ReferenceEntityDetail
    title="How is this metric calculated?"
    detail="Second base bat curve relay world series, rhubarb cubs plunked second baseman. Robbed starter skipper center fielder pennant stance relay. Forkball rookie curve pitchout mound passed ball cardinals."
  />

const ReferenceEntityDescription = () =>
  <ReferenceEntityDetail
    title="Description"
    detail="Second base bat curve relay world series, rhubarb cubs plunked second baseman. Robbed starter skipper center fielder pennant stance relay. Forkball rookie curve pitchout mound passed ball cardinals."
  />

const ReferenceEntityImportance = ({entity}) =>
  <ReferenceEntityDetail
    title={`Why is this ${entity} important?`}
    detail="Second base bat curve relay world series, rhubarb cubs plunked second baseman. Robbed starter skipper center fielder pennant stance relay. Forkball rookie curve pitchout mound passed ball cardinals."
  />


const ReferenceEntityTitle = ({title}) => <h1>{title}</h1>

const ReferenceEntityHeader = ({children}) =>
  <Flex className="border-bottom py2 mb4" alignItems="center">{children}</Flex>

const ReferenceEntityActions = ({children}) =>
  <Block className="ml-auto">
    {children}
  </Block>

const EditEntityAction = ({href}) =>
  <Flex alignItems="center">
    <Link to={href}>
      <Icon name="pencil" />
      Edit
    </Link>
  </Flex>

const ReferenceEntityDetails = ({entity}) =>
  <div>
    <ReferenceEntityDescription />
    <ReferenceEntityImportance entity={entity} />
    { entity === 'metric' ? <MetricCalculation /> : null }
  </div>

class ReferenceEntity extends Component {
    componentWillMount() {
    }
    renderEntityIcon () {
      // should be able to juse use the singularized entity name here
      switch(singularize(this.props.params.entity)) {
        case 'metric':
          return <Icon name="check" />
        case 'list':
          return <Icon name="close" />
        case 'database':
          return <Icon name="database" />
        default:
          return <Icon name="chevronDown" />
      }
    }
    renderAdditionalInfo () {
      switch(singularize(this.props.params.entity)) {
        case 'metric':
          return <AdditionalMetricInfo />
        case 'list':
          return <Icon name="close" />
        case 'database':
          return <Icon name="clock" />
        default:
          return <Icon name="chevronDown" />
      }
    }
    render () {
        const { entity, id } = this.props.params
        return (
          <Flex>
              <Block width="40" height="40" className="mt4 mr4">
                  <div className="flex align-center justify-center bg-light-blue circle text-brand p4">
                    { this.renderEntityIcon() }
                  </div>
              </Block>
              <div className="flex-full">
                <ReferenceEntityHeader>
                    <ReferenceEntityTitle title="Lifetime value" />
                    <ReferenceEntityActions>
                        <EditEntityAction href={`/reference/${entity}/${id}/edit`} />
                    </ReferenceEntityActions>
                </ReferenceEntityHeader>
                <ReferenceEntityDetails entity={singularize(entity)} />
                <Block className="mt4">
                  { this.renderAdditionalInfo() }
                </Block>
              </div>
          </Flex>
        )
    }
}

export default ReferenceEntity
