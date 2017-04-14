import {
    getFormTitle,
    getActionText
} from './CollectionEditorForm'

const FORM_FIELDS = {
    id: { value: 4 },
    name: { value: 'Test collection' },
    color: { value: '#409ee3' },
    initialValues: {
        color: '#409ee3'
    }
}
const NEW_COLLECTION_FIELDS = { ...FORM_FIELDS, id: '', color: '' }

describe('CollectionEditorForm', () => {

    describe('Title', () => {
        it('should have a default title if no collection exists', () =>
            expect(getFormTitle(NEW_COLLECTION_FIELDS)).toEqual('New collection')
        )

        it('should have the title of the colleciton if one exists', () =>
            expect(getFormTitle(FORM_FIELDS)).toEqual(FORM_FIELDS.name.value)
        )
    })

    describe('Form actions', () => {
        it('should have a "create" primary action if no collection exists', () =>
            expect(getActionText(NEW_COLLECTION_FIELDS)).toEqual('Create')
        )

        it('should have an "update" primary action if no collection exists', () =>
            expect(getActionText(FORM_FIELDS)).toEqual('Update')
        )
    })

})
