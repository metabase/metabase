import MetabaseUtils from 'metabase/lib/utils';


describe('utils', () => {
    describe('generatePassword', () => {
        it('defaults to length 14 passwords', () => {
            expect(
                MetabaseUtils.generatePassword().length
            ).toBe(
                14
            );
        });

        it('creates passwords for the length we specify', () => {
            expect(
                MetabaseUtils.generatePassword(25).length
            ).toBe(
                25
            );
        });

        it('can enforce ', () => {
            expect(
                (MetabaseUtils.generatePassword(14, {digit: 2}).match(/([\d])/g).length >= 2)
            ).toBe(
                true
            );
        });

        it('can enforce digit requirements', () => {
            expect(
                (MetabaseUtils.generatePassword(14, {digit: 2}).match(/([\d])/g).length >= 2)
            ).toBe(
                true
            );
        });

        it('can enforce uppercase requirements', () => {
            expect(
                (MetabaseUtils.generatePassword(14, {uppercase: 2}).match(/([A-Z])/g).length >= 2)
            ).toBe(
                true
            );
        });

        it('can enforce special character requirements', () => {
            expect(
                (MetabaseUtils.generatePassword(14, {special: 2}).match(/([!@#\$%\^\&*\)\(+=._-{}])/g).length >= 2)
            ).toBe(
                true
            );
        });
    });
});
