import React from 'react';
import { shallow } from 'enzyme';

import { CollectionEditorFormActions } from './CollectionEditorForm'

const FORM_FIELDS = {
    id: { value: 4 },
    name: { value: 'Test collection' },
}

describe('CollectionEditorForm', () => {

    describe('CollectionEditorFormActions', () => {
        it('should have a "create" primary action if no collection exists', () => {
            const fields = { ...FORM_FIELDS, id: '' }
            const form = shallow(
                <CollectionEditorFormActions
                    fields={fields}
                />
            )
            expect(form.contains("Create")).toBe(true)
        })

        it('should have an "update" primary action if no collection exists', () => {
            const form = shallow(
                <CollectionEditorFormActions
                    fields={FORM_FIELDS}
                />
            )
            expect(form.contains("Update")).toBe(true)
        })
    })

})
