import React from 'react'
import { Link } from 'react-router'
import Color from 'color'

import Icon from 'metabase/components/Icon'
import Tooltip from 'metabase/components/Tooltip'
import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'

import CostSelect from 'metabase/xray/components/CostSelect'
import Histogram from 'metabase/xray/Histogram'

import { getIconForField } from 'metabase/lib/schema_metadata'
import { distanceToPhrase } from 'metabase/xray/utils'

const ComparisonField = ({ field }) =>
    <li
        key={field.id}
        className="my2 mr2 inline-block"
    >
        <Tooltip tooltip={field.description}>
            <div className="flex align-center">
                <Icon name={getIconForField(field)} className="mr1 text-grey-2" size={22} />
                <h3>{field.display_name}</h3>
            </div>
        </Tooltip>
    </li>

const CompareInts = ({ itemA, itemAColor, itemB, itemBColor }) =>
    <div className="flex">
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: itemAColor,
                backgroundColor: Color(itemAColor).lighten(0.5)
            }}
        >
            <h3>{itemA}</h3>
        </div>
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: itemBColor,
                backgroundColor: Color(itemBColor).lighten(0.4)
            }}
        > <h3>{itemB}</h3>
        </div>
    </div>

const CompareHistograms = ({ itemA, itemAColor, itemB, itemBColor }) =>
    <div className="flex" style={{ height: 60 }}>
        <div
            className="flex-full"
        >
            <Histogram
                histogram={itemA}
                color={itemAColor}
                showAxis={false}
            />
        </div>
        <div
            className="flex-full"
        >
            <Histogram
                histogram={itemB}
                color={itemBColor}
                showAxis={false}
            />
        </div>
    </div>


const XRayComparison = ({
    comparison,
    comparisonFields,
    itemA,
    itemB,
    fields,
    cost
}) => {
    return (
        <XRayPageWrapper>
            <div>
                <div className="my4 flex align-center">
                    <h1 className="flex align-center">
                        <Icon name="compare" className="mr1" size={32} />
                        Comparing
                    </h1>
                    <div className="ml-auto">
                        <CostSelect
                            currentCost={cost}
                        />
                    </div>
                </div>
                <div className="flex">
                    <Link
                        to={`/xray/${itemA.itemType}/${itemA.id}/approximate`}
                        className="no-decoration text-green-hover flex align-center bordered shadowed bg-white p1 px2 rounded mr1"
                    >
                        <div style={{
                            width: 12,
                            height: 12,
                            backgroundColor: itemA.color,
                            borderRadius: 99,
                            display: 'block'
                        }}>
                        </div>
                        <h2 className="ml1">{itemA.name}</h2>
                    </Link>
                    <Link
                        to={`/xray/${itemB.itemType}/${itemB.id}/approximate`}
                        className="no-decoration text-orange-hover flex align-center bordered shadowed bg-white p1 px2 rounded mr1"
                    >
                        <div style={{
                            width: 12,
                            height: 12,
                            backgroundColor: itemB.color,
                            borderRadius: 99,
                            display: 'block'
                        }}>
                        </div>
                        <h2 className="ml1">{itemB.name}</h2>
                    </Link>
                </div>
            </div>

            <Heading heading="Overview" />
            <div className="bordered rounded bg-white shadowed p4">
                <h3 className="text-grey-3">Count</h3>
                <div className="flex my1">
                    <h1
                        className="mr1"
                        style={{ color: itemA.color}}
                    >
                        {itemA.constituents[fields[0].name].count.value}
                    </h1>
                    <span className="h1 text-grey-1 mr1">/</span>
                    <h1 style={{ color: itemB.color}}>
                        {itemB.constituents[fields[1].name].count.value}
                    </h1>
                </div>
            </div>

            <div className="Grid Grid--gutters Grid--1of2">
                <div className="Grid-cell">
                    <Heading heading="Most different" />
                    <ol className="bordered rounded bg-white shadowed px4 py1">
                        { fields.slice(0, 3).map(field =>
                            <ComparisonField field={field} />
                        )}
                    </ol>
                </div>

                <div className="Grid-cell">
                    <Heading heading="Most similar" />
                    <div className="bordered rounded bg-white shadowed px4 py1">
                        { fields.slice().reverse().slice(0, 3).map(field =>
                            <ComparisonField field={field} />
                        )}
                    </div>
                </div>
            </div>

            <Heading heading="Full breakdown" />
            <div className="bordered rounded bg-white shadowed">

                <div className="flex p2">
                    <h4 className="mr1" style={{ color: itemA.color}}>
                        {itemA.name}
                    </h4>
                    <h4 style={{ color: itemB.color}}>
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
                                            className="px2 no-decoration flex align-center text-brand-hover"
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
                                            itemAColor={itemA.color}
                                            itemB={itemB.constituents[field.name]['histogram'].value}
                                            itemBColor={itemB.color}
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
    )
}


export default XRayComparison



