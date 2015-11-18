describe('metabase', function() {
    it('should redirect logged-out user to /auth/login', function() {
        browser.get('/');
        expect(browser.getLocationAbsUrl()).toMatch("/auth/login");
    });
});
