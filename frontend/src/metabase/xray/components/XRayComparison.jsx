import React from 'react'
import { Link } from 'react-router'

import { normal } from 'metabase/lib/colors'

import { XRayPageWrapper, Heading } from 'metabase/xray/components/XRayLayout'

import Histogram from 'metabase/xray/Histogram'

const CompareInts = ({ itemA, itemB }) =>
    <div className="flex">
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: 'white',
                backgroundColor: normal.blue
            }}
        >
            <h3>{itemA}</h3>
        </div>
        <div
            className="p2 text-align-center flex-full"
            style={{
                color: 'white',
                backgroundColor: normal.yellow
            }}
        > <h3>{itemB}</h3>
        </div>
    </div>

const CompareHistograms = ({ itemA, itemB }) =>
    <div className="flex" style={{ height: 60 }}>
        <div
            className="flex-full"
        >
            <Histogram
                histogram={itemA}
                color={normal.blue}
                showAxis={false}
            />
        </div>
        <div
            className="flex-full"
        >
            <Histogram
                histogram={itemB}
                color={normal.yellow}
                showAxis={false}
            />
        </div>
    </div>


const XRayComparison = ({
    comparison,
    comparisonFields,
    itemA,
    itemB,
    fields
}) => {
    window.itemA = itemA
    return (
        <XRayPageWrapper>
            <div>
                <h1>Comparing</h1>
                <div className="flex">
                    <Link to={`/xray/${itemA.itemType}/${itemA.id}/approximate`}>
                        <h2 style={{ color: normal.blue}}>{itemA.name}</h2>
                    </Link>
                    <Link to={`/xray/${itemB.itemType}/${itemB.id}/approximate`}>
                        <h2 style={{ color: normal.yellow}}>{itemB.name}</h2>
                    </Link>
                </div>
            </div>
            <Heading heading="Overview" />
            <div className="bordered rounded bg-white shadowed my4">
                <div className="Grid Grid--1of4">
                    <div className="Grid-cell p4">
                        <h3>Count</h3>
                        <div className="flex">
                            <h2 style={{ color: normal.blue}}>{itemA.constituents[fields[0].name].count.value}</h2>
                            <h2 style={{ color: normal.yellow}}>{itemB.constituents[fields[1].name].count.value}</h2>
                        </div>
                    </div>
                </div>
            </div>

            <Heading heading="Full breakdown" />
            <div className="bordered rounded bg-white shadowed my4">

                <div className="flex">
                    <h4 style={{ color: normal.blue}}>{itemA.name}</h4>
                    <h4 style={{ color: normal.yellow}}>{itemB.name}</h4>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Field</th>
                            {comparisonFields.map(c =>
                                <th key={c}>{c}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        { fields.map(field => {
                            console.log(field)
                            return (
                                <tr key={field.id}>
                                    <td>
                                        <Link to={`/xray/field/${field.id}/approximate`}>
                                            <h3>{field.display_name}</h3>
                                        </Link>
                                    </td>
                                    <td>{comparison[field.name].distance}</td>
                                    <td>{comparison[field.name].threshold}</td>
                                    <td>
                                        { itemA.constituents[field.name]['entropy'] && (
                                            <CompareInts
                                                itemA={itemA.constituents[field.name]['entropy']['value']}
                                                itemB={itemB.constituents[field.name]['entropy']['value']}
                                            />
                                        )}
                                    </td>
                                    <td>
                                        { itemA.constituents[field.name]['count'] && (
                                            <CompareInts
                                                itemA={itemA.constituents[field.name]['count']['value']}
                                                itemB={itemB.constituents[field.name]['count']['value']}
                                            />
                                        )}
                                    </td>
                                    <td style={{minWidth: 400}}>
                                        { itemA.constituents[field.name]['histogram'] && (
                                        <CompareHistograms
                                            itemA={itemA.constituents[field.name]['histogram'].value}
                                            itemB={itemB.constituents[field.name]['histogram'].value}
                                        />
                                        )}
                                    </td>
                                    <td>
                                        { itemA.constituents[field.name]['uniqueness'] && (
                                            <CompareInts
                                                itemA={itemA.constituents[field.name]['uniqueness']['value']}
                                                itemB={itemB.constituents[field.name]['uniqueness']['value']}
                                            />
                                        )}
                                    </td>
                                    <td>
                                        { itemA.constituents[field.name]['nil%'] && (
                                            <CompareInts
                                                itemA={itemA.constituents[field.name]['nil%']['value']}
                                                itemB={itemB.constituents[field.name]['nil%']['value']}
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



