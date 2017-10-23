import React, { Component } from 'react'
import cxs from "cxs";
import { formatTimeWithUnit } from "metabase/lib/formatting";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { Link } from "react-router";
import Question from "metabase-lib/lib/Question";

const termStyles = cxs({
    textDecoration: "none",
    borderBottom: '1px dotted #DCE1E4'
})
const TermWithDefinition = ({ children, definition, link }) =>
    <Tooltip tooltip={definition}>
        { link
            ? <a href={link} className={termStyles} target="_blank">{ children }</a>
            : <span className={termStyles}>{ children }</span>
        }

    </Tooltip>

class NormalRangeInsight extends Component {
    static insightType = "normal-range"
    static title = "Normal range of values"
    static icon = "insight"

    render() {
        const { min, max, features: { model } } = this.props
        return (
            <p>Normal value for { model.name } is between { min } and { max }.</p>
        )
    }
}

class GapsInsight extends Component {
    static insightType = "gaps"
    static title = "Gaps in the data"
    static icon = "insight"

    render() {
        const { mode, quality, filter, features: { table } } = this.props

        const viewAllRowsUrl = table && Question.create()
            .query()
            // imitate the required hydrated metadata format
            .setTable({ ...table, database: { id: table.db_id }})
            .addFilter(filter)
            .question()
            .getUrl()

        // construct the question with filter
        return (
            <p>
                You have { quality } { mode } values in your data.
                <span> </span>
                { table && <span><Link to={viewAllRowsUrl}>View all rows</Link> with { mode } value.</span> }
            </p>
        )
    }
}

class NoisinessInsight extends Component {
    static insightType = "noisy"
    static title = "Noisy data"
    static icon = "insight"

    render() {
        const { noise, quality, "recommended-resolution": resolution } = this.props

        // do we want to display the smoothness in a tooltip or something?
        return (
            <p>
                Your data is { quality }
                <span> </span>
                <TermWithDefinition definition={noise.description} link={noise.link}>noisy</TermWithDefinition>.
                Perhaps try smoothing it or choose a { resolution } resolution.
            </p>
        )
    }
}

class RegimeChangeInsight extends Component {
    static insightType = "regime-change"
    static title = "Regime change"
    static icon = "insight"

    render() {
        let { breaks, resolution } = this.props

        resolution = resolution || "day"

        return (
            <p>
                Your data can be split into { breaks.length } periods of growth:
                { breaks.map(({ from, to, shape }) => {
                    if (from === "beginning") return <span>{shape} period until {formatTimeWithUnit(to, resolution)}</span>
                    if (to === "now") return <span>{shape} period from {formatTimeWithUnit(from, resolution)} until now</span>
                    return <span>{shape} period from {formatTimeWithUnit(from, resolution)} until now.</span>
                })}
            </p>
        )
    }
}

const INSIGHT_COMPONENTS = [
    // numeric fields
    NormalRangeInsight,
    GapsInsight,
    // timestamps
    NoisinessInsight,
    RegimeChangeInsight
]

const generateInsightCardClasses = (autoSize) => cxs({
    width: !autoSize && '22em',
    height: '10em',
    ' .Icon': {
        color: '#93a1ab'
    },
    ' header span': {
        fontSize: '0.85em',
    },
    ' p': {
        lineHeight: '1.4em'
    }

})
export const InsightCard = ({type, props, features, autoSize}) => {
    const Insight = INSIGHT_COMPONENTS.find((component) => component.insightType === type)

    return (
        <div className={generateInsightCardClasses(autoSize)}>
            <div className="bg-white bordered rounded shadowed full-height p3">
                <header className="flex align-center">
                    <Icon name={Insight.icon} size={24} className="mr1" />
                    <span className="text-bold text-uppercase">{Insight.title}</span>
                </header>
                <Insight {...props} features={features} />
            </div>
        </div>
    )
}
