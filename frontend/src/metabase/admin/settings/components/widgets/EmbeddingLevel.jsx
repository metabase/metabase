import React, { Component } from 'react'
import cx from 'classnames'
import Confirm from "metabase/components/Confirm";

const PremiumExplanation = () =>
    <div>
        <p>Premium embedding lets you disable "Powered by Metabase" on your embeded dashboards and questions.</p>
        <a>Learn more</a>
    </div>

const BrandedExplanation = () =>
    <div>
        <p>You can embed Questions and dashboards. They'll say "Powered by Metabase" on the bottom.</p>
    </div>

class EmbeddingLevel extends Component {
    constructor (props) {
        super(props)
        this.state  = {
            showPremium: props.settingValues['premium-embedding-token']
        }
    }
    render () {
        const { updateSetting, settingValues } = this.props
        const { showPremium } = this.state

        const premiumToken = settingValues['premium-embedding-token']

        return (
            <div className="bordered rounded full" style={{ maxWidth: 820 }}>
                <ol className="flex border-bottom">
                    <li
                        className="flex-full p2 border-right text-centered text-bold cursor-pointer text-brand-hover"
                        onClick={() => updateSetting(false) }
                    >
                        Off
                    </li>
                    <li
                        onClick={() => {
                            this.setState({ showPremium: false })
                        }}
                        className={cx(
                            "flex-full p2 border-right text-centered text-bold cursor-pointer text-brand-hover",
                            { "text-brand": !showPremium }
                        )}
                    >
                        On (Branded)
                    </li>
                    <li
                        className={cx(
                            "p2 flex-full text-centered text-bold cursor-pointer text-brand-hover",
                            { "text-brand": showPremium }
                        )}
                        onClick={() => this.setState({ showPremium: true })}
                    >
                        Premium (Unbranded)
                    </li>
                </ol>
                <div className="p2 flex align-center justify-center">
                    { showPremium
                        ? (
                            <div>
                                { premiumToken
                                    ? (
                                        <div>
                                            Premium enabled
                                            { premiumToken }
                                        </div>
                                    ) : (
                                        <PremiumExplanation />
                                    )
                                }
                            </div>
                        )
                        : (
                            <div>
                                <BrandedExplanation />
                            </div>

                        )
                    }
                </div>
            </div>
        )
    }
}

export default EmbeddingLevel
