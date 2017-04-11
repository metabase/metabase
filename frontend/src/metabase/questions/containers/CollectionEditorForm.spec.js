import React from 'react';

import { mount, ReactWrapper } from 'enzyme';

import { CollectionEditorForm } from './CollectionEditorForm'

const FORM_FIELDS = {
    id: { value: 4 },
    name: { value: 'Test collection' },
}

describe('CollectionEditorForm', () => {
    describe('actions', () => {
        it('should have a "create" primary action if no collection exists', () => {
            const fields = { ...FORM_FIELDS, id: '' }
            const form = new ReactWrapper(
                mount(
                    <CollectionEditorForm
                        fields={fields}
                    />
                ).instance().footerRef,
                true
            )

            const text = form.find('button.Button--primary').text()
            expect(text).toEqual('Create')
        })

        it('should have an "update" primary action if no collection exists', () => {
            const form = new ReactWrapper(
                mount(
                    <CollectionEditorForm
                        fields={FORM_FIELDS}
                    />
                ).instance().footerRef,
                true
            )

            const text = form.find('button.Button--primary').text()
            expect(text).toEqual('Update')
        })
    }) })
