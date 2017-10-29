import React, { Component } from 'react'
import {
    //formatListOfItems,
    //formatTimeWithUnit,
    //inflect
} from "metabase/lib/formatting";
import Icon from "metabase/components/Icon";
import { Link } from "react-router";
import Question from "metabase-lib/lib/Question";
import { TermWithDefinition } from "metabase/components/TermWithDefinition";
import { t } from 'c-3po'

const InsightText = ({ children }) =>
    <p className="text-paragraph">
        {children}
    </p>

const Feedback = ({ insightType }) =>
    <div className="flex align-center px1">
        {t`Was this helpful?`}
        <div className="ml-auto text-bold">
            <a className="text-brand-hover" data-metabase-event={`InsightFeedback;${insightType};Yes`}>
                {t`Yes`}
            </a>
            <a className="text-brand-hover ml1" data-metabase-event={`InsightFeedback;${insightType};No`}>
                {t`No`}
            </a>
        </div>
    </div>

export class NormalRangeInsight extends Component {
    static insightType = "normal-range"
    static title = "Normal range of values"
    static icon = "insight"

    render() {
        const { lower, upper, features: { model } } = this.props
        return (
            <InsightText>
                Most of the values for { model.name } are between <b>{ lower }</b> and <b>{ upper }</b>.
            </InsightText>
        )
    }
}

export class NilsInsight extends Component {
    static insightType = "nils"
    static title = "Missing data"
    static icon = "warning"

    render() {
        const { quality, filter, features: { table } } = this.props

        const viewAllRowsUrl = table && Question.create()
            .query()
            // imitate the required hydrated metadata format
            .setTable({ ...table, database: { id: table.db_id }})
            .addFilter(filter)
            .question()
            .getUrl()

        // construct the question with filter
        return (
            <InsightText>
                You have { quality } missing (null) values in your data.
                <span> </span>
                { table && <span><Link to={viewAllRowsUrl}>View all rows</Link> with missing value.</span> }
            </InsightText>
        )
    }
}

export class ZerosInsight extends Component {
    static insightType = "zeros"
    static title = "0s in your data"
    static icon = "warning"

    render() {
        const { quality, filter, features: { table } } = this.props

        const viewAllRowsUrl = table && Question.create()
            .query()
            // imitate the required hydrated metadata format
            .setTable({ ...table, database: { id: table.db_id }})
            .addFilter(filter)
            .question()
            .getUrl()

        // construct the question with filter
        return (
            <InsightText>
                You have { quality } zeros in your data. They may be standins for missing data or indicate some other abnormality.
                <span> </span>
                { table && <span><Link to={viewAllRowsUrl}>View all rows</Link> with zeros.</span> }
            </InsightText>
        )
    }
}

const noisinessDefinition = "Noisy data is highly variable jumping all over the place with changes carrying relatively little information."
const noisinessLink = "https://en.wikipedia.org/wiki/Noisy_data"

export class NoisinessInsight extends Component {
    static insightType = "noisiness"
    static title = "Noisy data"
    static icon = "warning"

    render() {
        const { quality, "recommended-resolution": resolution } = this.props

        return (
            <InsightText>
                Your data is { quality }
                <span> </span>
                <TermWithDefinition
                    definition={noisinessDefinition}
                    link={noisinessLink}
                >
                    noisy
            </TermWithDefinition>.
		{ resolution && ` You might consider looking at it by ${resolution}.` }
            </InsightText>
        )
    }
}

const autocorrelationDefinition = "Measure of how much (changes in) previous values predict future values."
const autocorrelationLink = "https://en.wikipedia.org/wiki/Autocorrelation"

export class AutocorrelationInsight extends Component {
    static insightType = "autocorrelation"
    static title = "Autocorrelation"
    static icon = "insight"

    render() {
        const { quality, lag } = this.props

        return (
            <InsightText>
                Your data has a { quality } <TermWithDefinition definition={autocorrelationDefinition} link={autocorrelationLink}>
                    autocorrelation
                </TermWithDefinition> at lag { lag }.
            </InsightText>
        )
    }
}

const variationTrendDefinition = "How variance in your data is changing over time."
const varianceLink = "https://en.wikipedia.org/wiki/Variance"

export class VariationTrendInsight extends Component {
    static insightType = "variation-trend"
    static title = `Trending variation`
    static icon = "insight"

    render() {
        const { mode } = this.props

        return (
            <InsightText>
                Looks like this data has grown { mode }ly  <TermWithDefinition definition={variationTrendDefinition} link={varianceLink}>
                    varied
                </TermWithDefinition> over time.
            </InsightText>
        )
    }
}

export class SeasonalityInsight extends Component {
    static insightType = "seasonality"
    static title = "Seasonality"
    static icon = "insight"

    render() {
        const { quality } = this.props

        return (
            <InsightText>
                Your data has a { quality } seasonal compoment.
            </InsightText>
        )
    }
}
/*
export class RegimeChangeInsight extends Component {
    static insightType = "regime-change"
    static title = "Regime change"
    static icon = "insight"

    getTextForBreak = ({ from, to, mode, shape }) => {
        let { resolution } = this.props
        resolution = resolution || "year"

        if (from === "beginning") return `${mode} ${shape} period until ${formatTimeWithUnit(to, resolution)}`
        if (to === "now") return `${mode} ${shape} period from ${formatTimeWithUnit(from, resolution)} until now`
        return `${mode} ${shape} period from ${formatTimeWithUnit(from, resolution)} until now`
    }

    render() {
        let { breaks } = this.props

        return (
            <p>
                Your data can be split into { breaks.length } { inflect("stages", breaks.length) }:
                <span> </span>
                { formatListOfItems(breaks.map(this.getTextForBreak)) }.
            </p>
        )
    }
}
*/


const INSIGHT_COMPONENTS = [
    // any field
    NilsInsight,
    // numeric fields
    NormalRangeInsight,
    ZerosInsight,
    // timeseries
    NoisinessInsight,
    VariationTrendInsight,
    AutocorrelationInsight,
    SeasonalityInsight,
    // RegimeChangeInsight
]

export const InsightCard = ({type, props, features}) => {
    const Insight = INSIGHT_COMPONENTS.find((component) => component.insightType === type)

    return (
        <div className="full-height">
            <div className="bg-white bordered rounded shadowed full-height p3">
                <header className="flex align-center">
                    <Icon
                        name={Insight.icon}
                        size={24}
                        className="mr1"
                        style={{ color: '#93a1ab' }}
                    />
                    <span className="text-bold text-uppercase">{Insight.title}</span>
                </header>
                <div style={{ lineHeight: '1.4em' }}>
                    <Insight {...props} features={features} />
                </div>
            </div>
            <div className="mt1">
                <Feedback insightType={type} />
            </div>
        </div>
    )
}
