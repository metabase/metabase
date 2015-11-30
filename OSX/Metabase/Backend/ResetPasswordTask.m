//
//  ResetPasswordTask.m
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "ResetPasswordTask.h"

NSString *ResetPasswordJarPath() {
	return [[NSBundle mainBundle] pathForResource:@"reset-password" ofType:@"jar"];
}

@interface ResetPasswordTask ()
@property (copy) NSString *output;
@end

@implementation ResetPasswordTask


#pragma mark - Local Methods

- (void)resetPasswordForEmailAddress:(NSString *)emailAddress success:(void (^)(NSString *))successBlock error:(void (^)(NSString *))errorBlock {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		self.task = [[NSTask alloc] init];
				
		NSString *dbPath = [DBPath() stringByAppendingString:@";IFEXISTS=TRUE"];
		self.task.environment = @{@"MB_DB_FILE": dbPath, @"HOME": @"/Users/camsaul"};
		
		// time travelers from the future: this is hardcoded since I'm the only one who works on this. I give you permission to fix it - Cam
		#define DEBUG_RUN_LEIN_TASK 0
		
		#if DEBUG_RUN_LEIN_TASK
			self.task.environment			= @{@"MB_DB_FILE": dbPath};
			self.task.currentDirectoryPath	= @"/Users/camsaul/metabase";
			self.task.launchPath			= @"/Users/camsaul/scripts/lein";
			self.task.arguments				= @[@"with-profile", @"reset-password", @"run", emailAddress];
			NSLog(@"Launching ResetPasswordTask\nMB_DB_FILE='%@' lein with-profile reset-password run %@", dbPath, emailAddress);
		#else
			self.task.environment	= @{@"MB_DB_FILE": dbPath};
			self.task.launchPath	= JREPath();
			self.task.arguments		= @[@"-classpath", [NSString stringWithFormat:@"%@:%@", UberjarPath(), ResetPasswordJarPath()],
										@"metabase.reset_password.core", emailAddress];
			NSLog(@"Launching ResetPasswordTask\nMB_DB_FILE='%@' %@ -classpath %@:%@ metabase.reset_password.core %@", dbPath, JREPath(), UberjarPath(), ResetPasswordJarPath(), emailAddress);
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
