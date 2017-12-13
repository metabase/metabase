import React from 'react'
import SettingsSetting from 'metabase/admin/settings/components/SettingsSetting'
import cx from 'classnames'
import { t, jt } from 'c-3po'

import Icon from 'metabase/components/Icon'

import COSTS from 'metabase/xray/costs'

const SettingsXrayForm = ({ settings, elements, updateSetting }) => {
    let maxCost = Object.assign({}, ...elements.filter(e => e.key === 'xray-max-cost',))
    const enabled = Object.assign({}, ...elements.filter(e => e.key === 'enable-xrays',))

    // handle the current behavior of the default
    if(maxCost.value == null) {
        maxCost.value = 'extended'
    }

    return (
        <div>
            <div className="mx2">
                <h2>{t`X-Rays and Comparisons`}</h2>
            </div>

            <ol className="mt4">
                <SettingsSetting
                    key={enabled.key}
                    setting={enabled}
                    onChange={(value) => updateSetting(enabled, value)}
                />
            </ol>

            <div className="mx2 text-measure">
                <h3>{t`Maximum Cost`}</h3>
                <p className="m0 text-paragraph">
                    {t`If you're having performance issues related to x-ray usage you can cap how expensive x-rays are allowed to be.`}
                </p>
                <p className="text-paragraph">
                  <em>{jt`${<strong>Note:</strong>} "Extended" is required for viewing time series x-rays.`}</em>
                </p>

                <ol className="mt4">
                    { Object.keys(COSTS).map(key => {
                        const cost = COSTS[key]
                        return (
                            <li
                                className={cx(
                                    'flex align-center mb2 cursor-pointer text-brand-hover',
                                    { 'text-brand' : maxCost.value === key }
                                )}
                                key={key}
                                onClick={() => updateSetting(maxCost, key)}
                            >
                                <Icon
                                    className="flex-no-shrink"
                                    name={cost.icon}
                                    size={24}
                                />
                                <div className="ml2">
                                    <h4>{cost.display_name}</h4>
                                    <p className="m0 text-paragraph">
                                        {cost.description}
                                    </p>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            </div>
        </div>
    )
}

export default SettingsXrayForm
