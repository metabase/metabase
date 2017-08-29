import React from 'react'
import { Link } from 'react-router'
import Color from 'color'
import Visualization from 'metabase/visualizations/components/Visualization'

import Icon from 'metabase/components/Icon'
import Tooltip from 'metabase/components/Tooltip'
import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'
import ItemLink from 'metabase/xray/components/ItemLink'

import ComparisonHeader from 'metabase/xray/components/ComparisonHeader'

import { getIconForField } from 'metabase/lib/schema_metadata'
import { distanceToPhrase } from 'metabase/xray/utils'

// right now we rely on knowing that itemB is the only one that
// can contain a table
const fieldLinkUrl = (itemA, itemB, fieldName) => {
    let url = `segments/${itemA.id}/${itemB.id}`
    if(itemB.itemType === 'table') {
        url = `segment/${itemA.id}/table/${itemB.id}`
    }
    return `/xray/compare/${url}/field/${fieldName}/approximate`
}

const itemLinkUrl = (item) =>
    `/xray/${item.itemType}/${item.id}/approximate`

const CompareInts = ({ itemA, itemAColor, itemB, itemBColor }) =>
    <div className="flex">
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: itemAColor.text,
                backgroundColor: Color(itemAColor.main).lighten(0.1)
            }}
        >
            <h3>{itemA}</h3>
        </div>
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: itemBColor.text,
                backgroundColor: Color(itemBColor.main).lighten(0.4)
            }}
        >
            <h3>{itemB}</h3>
        </div>
    </div>

const Contributor = ({ contributor, itemA, itemB }) =>
    <div>
        <h3 className="mb2">
            {contributor.field.display_name}
        </h3>

        <div className="bg-white shadowed rounded bordered">
                <div>
                    <div className="p2 flex align-center">
                        <h4>{contributor.feature.label}</h4>
                        <Tooltip tooltip={contributor.feature.description}>
                            <Icon
                                name="infooutlined"
                                className="ml1 text-grey-4"
                                size={14}
                            />
                        </Tooltip>
                    </div>
                    <div className="py1">
                        { contributor.feature.type === 'histogram' ? (
                            <CompareHistograms
                                itemA={contributor.feature.value.a}
                                itemB={contributor.feature.value.b}
                                itemAColor={itemA.color.main}
                                itemBColor={itemB.color.main}
                                showAxis={true}
                                height={120}
                            />
                        ) : (
                            <div className="flex align-center px2 py3">
                                <h1 className="p3" style={{ color: itemA.color.text }}>
                                    {contributor.feature.value.a}
                                </h1>
                                <h1 className="p3" style={{ color: itemB.color.text }}>
                                    {contributor.feature.value.b}
                                </h1>
                            </div>
                        )}
                    </div>
                </div>

            <div className="flex">
                <Link
                    to={fieldLinkUrl(itemA, itemB, contributor.field.name)}
                    className="text-grey-3 text-brand-hover no-decoration transition-color ml-auto text-bold px2 pb2"
                >
                    View full comparison
                    </Link>
                </div>
            </div>
    </div>

const CompareHistograms = ({ itemA, itemAColor, itemB, itemBColor, showAxis = false, height = 60}) =>
    <div className="flex" style={{ height }}>
        <div className="flex-full">
            <Visualization
                className="full-height"
                series={[
                    {
                        card: {
                            display: "bar",
                            visualization_settings: {
                                "graph.colors": [itemAColor, itemBColor],
                                "graph.x_axis.axis_enabled": showAxis,
                                "graph.x_axis.labels_enabled": showAxis,
                                "graph.y_axis.axis_enabled": showAxis,
                                "graph.y_axis.labels_enabled": showAxis
                            }
                        },
                        data: itemA
                    },
                    {
                        card: {
                            display: "bar",
                            visualization_settings: {
                                "graph.colors": [itemAColor, itemBColor],
                                "graph.x_axis.axis_enabled": showAxis,
                                "graph.x_axis.labels_enabled": showAxis,
                                "graph.y_axis.axis_enabled": showAxis,
                                "graph.y_axis.labels_enabled": showAxis
                            }
                        },
                        data: itemB
                    },

                ]}
            />
        </div>
    </div>


const XRayComparison = ({
    contributors,
    comparison,
    comparisonFields,
    itemA,
    itemB,
    fields,
    cost
}) =>
    <XRayPageWrapper>
        <div>
            <ComparisonHeader
                cost={cost}
            />
            <div className="flex">
                <ItemLink
                    link={itemLinkUrl(itemA)}
                    item={itemA}
                />
                <ItemLink
                    link={itemLinkUrl(itemB)}
                    item={itemB}
                />
            </div>
        </div>

        <Heading heading="Overview" />
        <div className="bordered rounded bg-white shadowed p4">
            <h3 className="text-grey-3">Count</h3>
            <div className="flex my1">
                <h1
                    className="mr1"
                    style={{ color: itemA.color.text}}
                >
                    {itemA.constituents[fields[0].name].count.value}
                </h1>
                <span className="h1 text-grey-1 mr1">/</span>
                <h1 style={{ color: itemB.color.text}}>
                    {itemB.constituents[fields[1].name].count.value}
                </h1>
            </div>
        </div>

        { contributors && (
            <div>
                <Heading heading="Potentially interesting differences" />
                <ol className="Grid Grid--gutters Grid--1of3">
                    { contributors.map(contributor =>
                        <li className="Grid-cell" key={contributor.field.id}>
                            <Contributor
                                contributor={contributor}
                                itemA={itemA}
                                itemB={itemB}
                            />
                        </li>
                    )}
                </ol>
            </div>
        )}

        <Heading heading="Full breakdown" />
        <div className="bordered rounded bg-white shadowed">

            <div className="flex p2">
                <h4 className="mr1" style={{ color: itemA.color.text}}>
                    {itemA.name}
                </h4>
                <h4 style={{ color: itemB.color.text}}>
                    {itemB.name}
                </h4>
            </div>

            <table className="ComparisonTable full">
                <thead className="full border-bottom">
                    <tr>
                        <th className="px2">Field</th>
                        {comparisonFields.map(c =>
                            <th
                                key={c}
                                className="px2 py2"
                            >
                                {c}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="full">
                    { fields.map(field => {
                        return (
                            <tr key={field.id}>
                                <td className="border-right">
                                    <Link
                                        to={`/xray/field/${field.id}/approximate`}
                                        className="px2 no-decoration text-brand flex align-center"
                                    >
                                        <Icon name={getIconForField(field)} className="text-grey-2 mr1" />
                                        <h3>{field.display_name}</h3>
                                    </Link>
                                </td>
                                <td className="border-right px2">
                                    <h3>{distanceToPhrase(comparison[field.name].distance)}</h3>
                                </td>
                                <td className="border-right">
                                    { itemA.constituents[field.name]['entropy'] && (
                                        <CompareInts
                                            itemA={itemA.constituents[field.name]['entropy']['value']}
                                            itemAColor={itemA.color}
                                            itemB={itemB.constituents[field.name]['entropy']['value']}
                                            itemBColor={itemB.color}
                                        />
                                    )}
                                </td>
                                <td
                                    className="px2 border-right"
                                    style={{minWidth: 400}}
                                >
                                    { itemA.constituents[field.name]['histogram'] && (
                                    <CompareHistograms
                                        itemA={itemA.constituents[field.name]['histogram'].value}
                                        itemAColor={itemA.color.main}
                                        itemB={itemB.constituents[field.name]['histogram'].value}
                                        itemBColor={itemB.color.main}
                                    />
                                    )}
                                </td>
                                <td className="px2 h3">
                                    { itemA.constituents[field.name]['nil%'] && (
                                        <CompareInts
                                            itemA={itemA.constituents[field.name]['nil%']['value']}
                                            itemAColor={itemA.color}
                                            itemB={itemB.constituents[field.name]['nil%']['value']}
                                            itemBColor={itemB.color}
                                        />
                                    )}
                                </td>
                            </tr>
                        )})}
                </tbody>
            </table>
        </div>
    </XRayPageWrapper>

export default XRayComparison
