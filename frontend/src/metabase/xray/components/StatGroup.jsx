import React from 'react'
import { Heading } from 'metabase/xray/components/XRayLayout'
import SimpleStat from 'metabase/xray/SimpleStat'

const atLeastOneStat = (fingerprint, stats) =>
    stats.filter(s => fingerprint[s]).length > 0

const StatGroup = ({ heading, fingerprint, stats, showDescriptions }) =>
    atLeastOneStat(fingerprint, stats) && (
        <div className="my4">
            <Heading heading={heading} />
            <div className="bordered rounded shadowed bg-white">
                <ol className="Grid Grid--1of4">
                    { stats.map(stat =>
                        !!fingerprint[stat] && (
                            <li className="Grid-cell lg-p3 lg-px4 border-right border-bottom" key={stat}>
                                <SimpleStat
                                    stat={fingerprint[stat]}
                                    showDescription={showDescriptions}
                                />
                            </li>
                        )
                    )}
                </ol>
            </div>
        </div>
    )

export default StatGroup
