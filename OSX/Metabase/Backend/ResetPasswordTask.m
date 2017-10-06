//
//  ResetPasswordTask.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "AppDelegate.h"
#import "ResetPasswordTask.h"

@interface ResetPasswordTask ()
@property (copy) NSString *output;
@end

@implementation ResetPasswordTask


#pragma mark - Local Methods

- (void)resetPasswordForEmailAddress:(NSString *)emailAddress success:(void (^)(NSString *))successBlock error:(void (^)(NSString *))errorBlock {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
        // first, we need to stop the main Metabase task so we can access the DB
        NSLog(@"Stopping Metabase task in order to reset password...");
        [[AppDelegate instance] stopMetabaseTask];
        
		self.task = [[NSTask alloc] init];
				
		// time travelers from the future: this is hardcoded since I'm the only one who works on this. I give you permission to fix it - Cam
		#define DEBUG_RUN_LEIN_TASK 0
		
		#if DEBUG_RUN_LEIN_TASK
			self.task.environment			= @{@"MB_DB_FILE": DBPath()};
			self.task.currentDirectoryPath	= @"/Users/cam/metabase";
			self.task.launchPath			= @"/usr/local/bin/lein";
			self.task.arguments				= @[@"run", @"reset-password", emailAddress];
			NSLog(@"Launching ResetPasswordTask\nMB_DB_FILE='%@' lein run reset-password %@", DBPath(), emailAddress);
		#else
			self.task.environment	= @{@"MB_DB_FILE": DBPath()};
			self.task.launchPath	= JREPath();
            self.task.arguments		= @[@"-Djava.awt.headless=true", // this prevents the extra java icon from popping up in the dock when running
                                        @"-Xverify:none",            // disable bytecode verification for faster launch speed, not really needed here since JAR is packaged as part of signed .app
                                        @"-jar", UberjarPath(),
                                        @"reset-password", emailAddress];
			NSLog(@"Launching ResetPasswordTask\nMB_DB_FILE='%@' %@ -jar %@ reset-password %@", DBPath(), JREPath(), UberjarPath(), emailAddress);
		#endif
		
		__weak ResetPasswordTask *weakSelf = self;
		self.task.terminationHandler = ^(NSTask *task) {
			NSLog(@"ResetPasswordTask terminated with status: %d", task.terminationStatus);
			[weakSelf terminate];
			
			dispatch_async(dispatch_get_main_queue(), ^{
				if (!task.terminationStatus && weakSelf.output.length >= 38) { // should be of format <user-id>_<36-char-uuid>, e.g. "1_b20466b9-1f5b-488d-8ab6-5039107482f8"
					successBlock(weakSelf.output);
				} else {
					errorBlock(weakSelf.output.length ? weakSelf.output : @"An unknown error has occured.");
				}
                
                // now restart the main Metabase task
                NSLog(@"Reset password complete, restarting Metabase task...");
                [[AppDelegate instance] startMetabaseTask];
			});
		};
		
		[self.task launch];
	});
}

- (void)readHandleDidRead:(NSString *)message {
	NSLog(@"[PasswordResetTask] %@", message);
	
	/// output comes back like "STATUS [[[message]]]"
	NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^(?:(?:OK)||(?:FAIL))\\s+\\[\\[\\[(.+)\\]\\]\\]\\s*$" options:NSRegularExpressionAnchorsMatchLines|NSRegularExpressionAllowCommentsAndWhitespace error:NULL];

	if (![regex numberOfMatchesInString:message options:0 range:NSMakeRange(0, message.length)]) return;
	
	NSString *result = [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@"$1"];
	if (result) {
		self.output = result;
		NSLog(@"[PasswordResetTask] task output is '%@'", self.output);
	}
}

@end
