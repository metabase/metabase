import React from 'react'
import { Link } from 'react-router'

import Histogram from 'metabase/xray/Histogram'
import SimpleStat from 'metabase/xray/SimpleStat'

const Constituent = ({constituent}) =>
    <div className="Grid my3 bg-white bordered rounded shadowed">
        <div className="Grid-cell Cell--1of3 border-right">
            <div className="p4">
                <Link
                    to={`xray/field/${constituent.field.id}/approximate`}
                    className="text-brand-hover link transition-text"
                >
                    <h2 className="text-bold">{constituent.field.display_name}</h2>
                </Link>
                <p className="text-measure text-paragraph">{constituent.field.description}</p>

                <div className="flex align-center">
                    { constituent.min && (
                        <SimpleStat
                            stat={constituent.min}
                        />
                    )}
                    { constituent.max && (
                        <SimpleStat
                            stat={constituent.max}
                        />
                    )}
                </div>
            </div>
        </div>
        <div className="Grid-cell p3">
            <div style={{ height: 220 }}>
                <Histogram histogram={constituent.histogram.value} />
            </div>
        </div>
    </div>

export default Constituent
