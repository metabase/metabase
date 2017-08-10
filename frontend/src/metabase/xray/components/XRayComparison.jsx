import React from 'react'
import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
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
        >
            <h3>{itemB}</h3>
        </div>
    </div>

const CompareHistograms = ({ itemA, itemB }) =>
    <div className="flex">
        <div
            className="p2 text-align-center flex-full"
        >
            <Histogram histogram={itemA} />
        </div>
        <div
            className="p2 text-align-center flex-full"
        >
            <Histogram histogram={itemB} />
        </div>
    </div>


const XRayComparison = ({
    comparison,
}) => {
    return (
        <LoadingAndErrorWrapper
            loading={!comparison}
            noBackground
        >
            { () => {
                const itemA = {
                    name: comparison.constituents[0].features.segment.name,
                    constituents: comparison.constituents[0].constituents,
                    linkType: 'segment'
                }
                const itemB = {
                    name: comparison.constituents[1].features.table.display_name,
                    constituents: comparison.constituents[1].constituents,
                    linkType: 'table'
                }

                console.log(itemA, itemB)

                return (
                    <XRayPageWrapper>
                        <div>
                            <h1>Comparing</h1>
                            <div className="flex">
                                <h2 style={{ color: normal.blue}}>{itemA.name}</h2>
                                <h2 style={{ color: normal.yellow}}>{itemB.name}</h2>
                            </div>
                        </div>
                        <div className="bordered rounded bg-white shadowed my4">

                            <div className="flex">
                                <h4 style={{ color: normal.blue}}>{itemA.name}</h4>
                                <h4 style={{ color: normal.yellow}}>{itemB.name}</h4>
                            </div>

                            <table>
                                <thead>
                                    <tr>
                                        <th>Field</th>
                                        <th>Diff score</th>
                                        {comparison.comparison[0].components.map(component =>
                                            <th>{component[0]}</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    { comparison.comparison.map((c, index) => {
                                        const field = comparison.constituents[0].constituents[index].field
                                        return (
                                            <tr>
                                                <td>
                                                    <Link to={`/xray/field/${field.id}/approximate`}>
                                                        <h3>{field.display_name}</h3>
                                                    </Link>
                                                </td>
                                                <td>{c.thereshold}</td>
                                                <td>
                                                    <CompareInts
                                                        itemA={itemA.constituents[index]['entropy']}
                                                        itemB={itemB.constituents[index]['entropy']}
                                                    />
                                                </td>
                                                <td>
                                                    <CompareInts
                                                        itemA={itemA.constituents[index]['count']}
                                                        itemB={itemB.constituents[index]['count']}
                                                    />
                                                </td>
                                                <td>
                                                    <CompareInts
                                                        itemA={itemA.constituents[index]['histogram']}
                                                        itemB={itemB.constituents[index]['histogram']}
                                                    />
                                                </td>
                                                <td>
                                                    <CompareInts
                                                        itemA={itemA.constituents[index]['uniqueness']}
                                                        itemB={itemB.constituents[index]['uniqueness']}
                                                    />
                                                </td>
                                                <td>
                                                    <CompareInts
                                                        itemA={itemA.constituents[index]['nil%']}
                                                        itemB={itemB.constituents[index]['nil%']}
                                                    />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </XRayPageWrapper>
                )
            }}
        </LoadingAndErrorWrapper>
    )
}


export default XRayComparison



