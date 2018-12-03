//
//  MainViewController.m
//  Metabase
//
//  Created by Cam Saul on 9/21/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

@import JavaScriptCore;
@import WebKit;

#import "INAppStoreWindow.h"

#import "LoadingView.h"
#import "MainViewController.h"
#import "ResetPasswordWindowController.h"
#import "SettingsManager.h"
#import "TaskHealthChecker.h"



NSString *BaseURL() {
	return SettingsManager.instance.baseURL.length ? SettingsManager.instance.baseURL : LocalHostBaseURL();
}


@interface MainViewController () <ResetPasswordWindowControllerDelegate>
@property (weak) IBOutlet WebView *webView;
@property (strong) IBOutlet NSView *titleBarView;

@property (weak) IBOutlet NSButtonCell *backButtonCell;
@property (weak) IBOutlet NSButtonCell *forwardButtonCell;
@property (weak) IBOutlet NSButtonCell *refreshButtonCell;
@property (weak) IBOutlet NSButtonCell *linkButtonCell;

@property (nonatomic, strong) ResetPasswordWindowController *resetPasswordWindowController;
@property (weak) LoadingView *loadingView;

@property (nonatomic) BOOL loading;

@property (nonatomic, strong) NSString *launchRoute; ///< redirect to this URL on launch if set. Used for password reset to take you to reset password page.

@end

@implementation MainViewController

#pragma mark - Lifecycle

- (void)awakeFromNib {
	// configure window / title bar
	{
		INAppStoreWindow *window = (INAppStoreWindow *)self.view.window;
		window.titleBarHeight = self.titleBarView.bounds.size.height;
		
		self.view.wantsLayer = YES;
		self.view.layer.backgroundColor = [NSColor whiteColor].CGColor;
		
		self.titleBarView.frame = window.titleBarView.bounds;
		self.titleBarView.autoresizingMask = NSViewWidthSizable|NSViewHeightSizable;
		[window.titleBarView addSubview:self.titleBarView];
	}
	
	// programatically add loading view to container
	{
		LoadingView *loadingView = [[LoadingView alloc] init];
		[self.view addSubview:loadingView];
		
		[self.view addConstraints:@[[NSLayoutConstraint constraintWithItem:loadingView attribute:NSLayoutAttributeWidth   relatedBy:NSLayoutRelationEqual toItem:nil       attribute:NSLayoutAttributeNotAnAttribute multiplier:1.0f constant:200.0f],
									[NSLayoutConstraint constraintWithItem:loadingView attribute:NSLayoutAttributeHeight  relatedBy:NSLayoutRelationEqual toItem:nil       attribute:NSLayoutAttributeNotAnAttribute multiplier:1.0f constant:200.0f],
									[NSLayoutConstraint constraintWithItem:loadingView attribute:NSLayoutAttributeCenterX relatedBy:NSLayoutRelationEqual toItem:self.view attribute:NSLayoutAttributeCenterX        multiplier:1.0f constant:0],
									[NSLayoutConstraint constraintWithItem:loadingView attribute:NSLayoutAttributeCenterY relatedBy:NSLayoutRelationEqual toItem:self.view attribute:NSLayoutAttributeCenterY        multiplier:1.0f constant:0]]];
		
		self.loadingView = loadingView;
	}
	
	self.webView.wantsLayer = YES;
	self.webView.animator.alphaValue = 0.0f;

	dispatch_async(dispatch_get_main_queue(), ^{
		self.loading = YES;
	});
	
	[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(taskBecameHealthy:) name:MetabaseTaskBecameHealthyNotification object:nil];
	[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(taskBecameUnhealthy:) name:MetabaseTaskBecameUnhealthyNotification object:nil];
}

- (void)dealloc {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
}


#pragma mark - Notifications

- (void)taskBecameHealthy:(NSNotification *)notification {
	dispatch_async(dispatch_get_main_queue(), ^{
        
        if (self.launchRoute) {
            [self navigateToRoute:self.launchRoute];
            self.launchRoute = nil;
        } else {
            [self loadMainPage];
        }
		
		dispatch_async(dispatch_get_main_queue(), ^{
			self.loading = NO;
		});
	});
}

- (void)taskBecameUnhealthy:(NSNotification *)notification {
	dispatch_async(dispatch_get_main_queue(), ^{
		self.loading = YES;
	});
}


#pragma mark - Local Methods

- (void)navigateToRoute:(nonnull NSString *)route {
    NSString *urlString = [BaseURL() stringByAppendingString:route];
    NSLog(@"Connecting to Metabase instance, navigating to page: %@", urlString);
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:urlString]];
    request.cachePolicy = NSURLCacheStorageAllowedInMemoryOnly;
    [self.webView.mainFrame loadRequest:request];

}

- (void)loadMainPage {
    [self navigateToRoute:@"/"];
}

- (void)downloadWithMethod:(NSString *)methodString url:(NSString *)urlString params:(NSDictionary *)paramsDict extensions:(NSArray *)extensions {
	NSSavePanel *savePanel			= [NSSavePanel savePanel];
	savePanel.extensionHidden		= NO;
	savePanel.showsTagField			= NO;
    if ([extensions count] > 0) {
        savePanel.allowedFileTypes = extensions;
        savePanel.allowsOtherFileTypes = NO;
    }
	
	NSString *downloadsDirectory	=  NSSearchPathForDirectoriesInDomains(NSDownloadsDirectory, NSUserDomainMask, YES)[0];
	savePanel.directoryURL			= [NSURL URLWithString:downloadsDirectory];
    
    // TODO: either figure out how to pull default filename from the Content-Disposition header or pass it in from JS land.
	NSDateFormatter *dateFormatter	= [[NSDateFormatter alloc] init];
	dateFormatter.locale			= [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
	dateFormatter.dateFormat		= @"yyyy-MM-dd'T'HH_mm_ss";
	savePanel.nameFieldStringValue	= [NSString stringWithFormat:@"query_result_%@", [dateFormatter stringFromDate:[NSDate date]]];
	
	if ([savePanel runModal] == NSFileHandlingPanelOKButton) {
		NSLog(@"Will save file at: %@", savePanel.URL);
		
        NSString *method = [methodString uppercaseString];
        
		NSURL *url = [NSURL URLWithString:urlString relativeToURL:[NSURL URLWithString:BaseURL()]];

        NSMutableString *query = [NSMutableString string];
        for (NSString* key in paramsDict) {
            NSString* value = [paramsDict objectForKey:key];
            [query appendFormat:@"%@=%@",
                                [key stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]],
                                [value stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]]];
        }
        
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringCacheData timeoutInterval:10.0f];
        request.HTTPMethod = [method uppercaseString];
        
        if ([query length] > 0) {
            if ([request.HTTPMethod isEqualToString:@"POST"] || [request.HTTPMethod isEqualToString:@"PUT"]) {
                NSData *data = [query dataUsingEncoding:NSUTF8StringEncoding];
                [request setValue:@"application/x-www-form-urlencoded" forHTTPHeaderField:@"Content-Type"];
                [request setValue:[NSString stringWithFormat:@"%lu", (NSUInteger)data.length] forHTTPHeaderField:@"Content-Length"];
                request.HTTPBody = data;
            } else {
                [request setURL:[NSURL URLWithString:[NSString stringWithFormat:@"%@?%@", urlString, query] relativeToURL:[NSURL URLWithString:BaseURL()]]];
            }
        }

		[NSURLConnection sendAsynchronousRequest:request queue:[[NSOperationQueue alloc] init] completionHandler:^(NSURLResponse *response, NSData *data, NSError *connectionError) {
			NSError *writeError = nil;
			[data writeToURL:savePanel.URL options:NSDataWritingAtomic error:&writeError];
			
			dispatch_async(dispatch_get_main_queue(), ^{
				if (writeError) {
					[[NSAlert alertWithError:writeError] runModal];
				} else {
					[[NSAlert alertWithMessageText:@"Saved" defaultButton:@"Done" alternateButton:nil otherButton:nil informativeTextWithFormat:@"Your data has been saved."] runModal];
				}
			});
		}];
	}
}

- (void)injectJS {
	JSContext *context = self.webView.mainFrame.javaScriptContext;
	
	// replace console.log with a function that calls NSLog so we can see the output
	context[@"console"][@"log"] = ^(JSValue *message) {
		NSLog(@"console.log: %@", message);
	};
	
	// custom functions for OS X integration are available to the frontend as properties of window.OSX
    context[@"OSX"] = @{@"download": ^(JSValue *method, JSValue *url, JSValue *params, JSValue *extensions) {
        [self downloadWithMethod:[method toString] url:[url toString] params:[params toDictionary] extensions:[extensions toArray]];
    }, @"resetPassword": ^(){
		[self resetPassword:nil];
    }};
}


#pragma mark - Getters / Setters

- (void)setLoading:(BOOL)loading {
	_loading = loading;

	if (loading) {
		self.webView.animator.alphaValue = 0;
		self.loadingView.animator.alphaValue = 1;
	} else {
		self.webView.animator.alphaValue = 1;
		self.loadingView.animator.alphaValue = 0;
		
		self.backButtonCell.enabled = self.forwardButtonCell.enabled = self.linkButtonCell.enabled = NO;
	}
	self.loadingView.animate = loading;
}

- (void)setResetPasswordWindowController:(ResetPasswordWindowController *)resetPasswordWindowController {
	[_resetPasswordWindowController.window close];
	
	_resetPasswordWindowController = resetPasswordWindowController;
	
	resetPasswordWindowController.delegate = self;
	[resetPasswordWindowController.window makeKeyWindow];
}


#pragma mark - Actions

- (IBAction)back:(id)sender {
	[self.webView goBack];
}

- (IBAction)forward:(id)sender {
	[self.webView goForward];
}

- (IBAction)reload:(id)sender {
	[self.webView.mainFrame reload];
}

- (IBAction)copyURLToClipboard:(id)sender {
	[NSPasteboard.generalPasteboard declareTypes:@[NSStringPboardType] owner:nil];
	[NSPasteboard.generalPasteboard setString:self.webView.mainFrameURL forType:NSStringPboardType];
	
	[[NSAlert alertWithMessageText:@"Link Copied" defaultButton:@"Ok" alternateButton:nil otherButton:nil informativeTextWithFormat:@"A link to this page has been copied to your clipboard."] runModal];
}

- (IBAction)resetPassword:(id)sender {
	self.resetPasswordWindowController = [[ResetPasswordWindowController alloc] init];
}


#pragma mark - ResetPasswordWindowControllerDelegate

- (void)resetPasswordWindowController:(ResetPasswordWindowController *)resetPasswordWindowController didFinishWithResetToken:(NSString *)resetToken {
	self.resetPasswordWindowController = nil;
    
    // now tell the app to reroute to the reset password page once Metabase relauches
    self.launchRoute = [@"/auth/reset_password/" stringByAppendingString:resetToken];
}


#pragma mark - WebResourceLoadDelegate

- (void)webView:(WebView *)sender resource:(id)identifier didFinishLoadingFromDataSource:(WebDataSource *)dataSource {
	[self injectJS];
	
	self.linkButtonCell.enabled = YES;
	self.backButtonCell.enabled = self.webView.canGoBack;
	self.forwardButtonCell.enabled = self.webView.canGoForward;
}


#pragma mark - WebPolicyDelegate

- (void)webView:(WebView *)webView decidePolicyForNewWindowAction:(NSDictionary *)actionInformation request:(NSURLRequest *)request newFrameName:(NSString *)frameName decisionListener:(id<WebPolicyDecisionListener>)listener {
	// Tell webkit window to open new links in browser
	NSURL *url = actionInformation[WebActionOriginalURLKey];
	[[NSWorkspace sharedWorkspace] openURL:url];
	[listener ignore];
}

@end
