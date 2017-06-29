import React, { Component } from "react"
import cx from "classnames"

import FormLabel from "metabase/components/form/FormLabel"
import FormMessage from "metabase/components/form/FormMessage"
import Select from "metabase/components/Select"

import Radio from 'metabase/components/Radio'

const DB_SYNC_OPTIONS = [
    { name: 'Hourly' },
    { name: 'Daily' },
]

export const SyncOption = ({ selected, name, description, children, select }) =>
    <div className="py2 relative" onClick={() => select(name.toLowerCase()) }>
        <div
            className={cx('circle ml2 flex align-center justify-center absolute')}
            style={{
                width: 18,
                height: 18,
                borderWidth: 2,
                borderColor: selected ? '#509ee3': '#ddd',
                borderStyle: 'solid'
            }}
        >
            { selected && <div className="circle" style={{ width: 8, height: 8, backgroundColor: selected ? '#509ee3' : '#ddd' }}></div> }
        </div>
        <div className="Form-offset">
            <div className={cx({ 'text-brand': selected })}>
                <h3>{name} - {description}</h3>
            </div>
            { selected && children && <div className="mt2">{children}</div> }
        </div>
    </div>

export default class DatabaseSchedulingForm extends Component {

    state = {
        valid: false,
        selected: 'often'
    }

    render () {
        const { formError, formSuccess } = this.props
        const { selected, valid } = this.state

        return (
            <form onSubmit={() => alert('Go forth noble JSON, do your dark work')} noValidate>

                <div className="Form-offset mr4 mt4">
                    <div>
                        <h3>Database syncing</h3>
                        <p className="text-paragraph text-measure">This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.</p>
                        <Select
                            value={DB_SYNC_OPTIONS[0]}
                            options={DB_SYNC_OPTIONS}
                        />
                    </div>
                    <div className="mt2">
                        <h3>Field figerprinting</h3>
                        <p className="text-paragraph text-measure">Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particulary if you have a very large database.</p>

                        <h3>How often do the values in the tables of this database change?</h3>
                        <ol className="bordered shadowed mt2">
                            <li className="border-bottom">
                                <SyncOption
                                    selected={selected === 'often'}
                                    name="Often"
                                    description="Metabase should re-scan at regular intervals"
                                    select={name => this.setState({ selected: name })}
                                >
                                    <div className="flex align-center">
                                        <Select value={{ name: 'Daily'}} options={[{}, {}]} />
                                        at
                                        <input className="input" type="text" value="12:00" />
                                        <Radio options={[{ name: 'AM' }, { name: 'PM' }]} />
                                    </div>
                                </SyncOption>
                            </li>
                            <li className="border-bottom">
                                <SyncOption
                                    selected={selected === 'rarely'}
                                    name="Rarely"
                                    description="Metabase should only re-scan when I tell it to manually"
                                    select={name => this.setState({ selected: name })}
                                />
                            </li>
                            <li>
                                <SyncOption
                                    selected={selected === 'never'}
                                    name="Never"
                                    description="This is a static database"
                                    select={name => this.setState({ selected: name })}
                                />
                            </li>
                        </ol>
                    </div>

                </div>
                <div className="Form-actions mt2">
                    <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                        Save
                    </button>
                    <FormMessage formError={formError} formSuccess={formSuccess}></FormMessage>
                </div>
            </form>
        )
    }
}
