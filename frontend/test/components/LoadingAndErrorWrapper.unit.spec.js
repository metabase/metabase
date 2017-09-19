import React from 'react'
import { shallow, mount } from 'enzyme'
import sinon from 'sinon'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

describe('LoadingAndErrorWrapper', () => {

    describe('Loading', () => {
        it('should display a loading message if given a true loading prop', () => {
            const wrapper = shallow(
                <LoadingAndErrorWrapper loading={true}>
                </LoadingAndErrorWrapper>
            )

            expect(wrapper.text()).toMatch(/Loading/)
        })

        it('should display a given child if loading is false', () => {
            const Child = () => <div>Hey</div>

            const wrapper = shallow(
                <LoadingAndErrorWrapper loading={false} error={null}>
                    { () => <Child /> }
                </LoadingAndErrorWrapper>
            )
            expect(wrapper.find(Child).length).toEqual(1)
        })

        it('should display a given scene during loading', () => {
            const Scene = () => <div>Fun load animation</div>

            const wrapper = shallow(
                <LoadingAndErrorWrapper
                    loading={true}
                    error={null}
                    loadingScenes={[<Scene />]}
                >
                </LoadingAndErrorWrapper>
            )

            expect(wrapper.find(Scene).length).toEqual(1)
        })

        describe('cycling', () => {
            let clock

            beforeEach(() => {
                clock = sinon.useFakeTimers()
            })
            afterEach(() => {
                clock.restore()
            })

            it('should cycle through loading messages if provided', () => {

                const interval = 6000

                const wrapper = mount(
                    <LoadingAndErrorWrapper
                        loading={true}
                        error={null}
                        loadingMessages={[
                            'One',
                            'Two',
                            'Three'
                        ]}
                        messageInterval={interval}
                    >
                    </LoadingAndErrorWrapper>

                )

                const instance = wrapper.instance()
                const spy = sinon.spy(instance, 'cycleLoadingMessage')

                expect(wrapper.text()).toMatch(/One/)

                clock.tick(interval)
                expect(spy.called).toEqual(true)
                expect(wrapper.text()).toMatch(/Two/)

                clock.tick(interval)
                expect(spy.called).toEqual(true)
                expect(wrapper.text()).toMatch(/Three/)

                clock.tick(interval)
                expect(spy.called).toEqual(true)
                expect(wrapper.text()).toMatch(/One/)
            })

        })
    })

    describe('Errors', () => {

        it('should display an error message if given an error object', () => {

            const error = {
                type: 500,
                message: 'Big error here folks'
            }

            const wrapper = mount(
                <LoadingAndErrorWrapper
                    loading={true}
                    error={error}
                >
                </LoadingAndErrorWrapper>

            )

            expect(wrapper.text()).toMatch(error.message)
        })
    })

})
