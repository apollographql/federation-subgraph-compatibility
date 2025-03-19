"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug_1 = __importDefault(require("debug"));
const artifact_1 = require("@actions/artifact");
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const federation_subgraph_compatibility_tests_1 = require("@apollo/federation-subgraph-compatibility-tests");
const fs_1 = require("fs");
const path_1 = require("path");
async function main() {
    const workingDirectory = (0, core_1.getInput)('workingDirectory');
    if (workingDirectory) {
        const newWorkingDirectory = (0, path_1.resolve)(process.cwd(), workingDirectory);
        process.chdir(newWorkingDirectory);
    }
    const debugMode = (0, core_1.getBooleanInput)('debug');
    if (debugMode) {
        debug_1.default.enable('info,pm2,docker,rover,test');
    }
    else {
        debug_1.default.enable('info');
    }
    const runtimeConfig = {
        kind: 'docker',
        schemaFile: (0, core_1.getInput)('schema'),
        composeFile: (0, core_1.getInput)('compose'),
        path: (0, core_1.getInput)('path') ?? '',
        port: (0, core_1.getInput)('port') ?? '4001',
        format: 'markdown',
        failOnRequired: (0, core_1.getBooleanInput)('failOnRequired') ?? false,
        failOnWarning: (0, core_1.getBooleanInput)('failOnWarning') ?? false,
    };
    try {
        const successful = await (0, federation_subgraph_compatibility_tests_1.compatibilityTest)(runtimeConfig);
        if (!successful) {
            (0, core_1.setFailed)('Some compatibility tests did not complete successfully.');
        }
    }
    catch (e) {
        let message;
        if (e instanceof Error) {
            message = e.message;
        }
        else {
            message = String(e);
        }
        (0, core_1.setFailed)(message);
    }
    console.log('');
    try {
        const results = (0, fs_1.readFileSync)('results.md', 'utf-8');
        const artifactPromise = uploadCompatibilityResultsArtifact();
        const jobSummaryPromise = commentOnJobSummary(results);
        const commentPromise = commentOnThePr(results);
        await Promise.all([artifactPromise, jobSummaryPromise, commentPromise]);
    }
    catch (e) {
        let message;
        if (e instanceof Error) {
            message = e;
        }
        else {
            message = String(e);
        }
        (0, core_1.warning)(message);
    }
}
async function uploadCompatibilityResultsArtifact() {
    logWithTimestamp('***********************\nuploading compatibility results workflow artifact\n***********************');
    const artifactClient = new artifact_1.DefaultArtifactClient();
    const artifactName = 'compatibility-results';
    const files = ['results.md'];
    const workingDirectory = (0, path_1.resolve)(process.cwd());
    await artifactClient.uploadArtifact(artifactName, files, workingDirectory);
}
async function commentOnJobSummary(results) {
    logWithTimestamp('***********************\ncreating job summary\n***********************');
    await core_1.summary
        .addHeading('Apollo Federation Subgraph Compatibility Results')
        .addCodeBlock(results)
        .write();
}
async function commentOnThePr(results) {
    const { pull_request } = github_1.context.payload;
    if (pull_request) {
        const token = (0, core_1.getInput)('token');
        logWithTimestamp('***********************\nattempting to comment on the PR\n***********************');
        if (token) {
            const octokit = (0, github_1.getOctokit)(token);
            const comments = await octokit.rest.issues.listComments({
                ...github_1.context.repo,
                issue_number: pull_request.number,
            });
            let lastCommentId = null;
            if (comments.status == 200 && comments.data) {
                const actionComment = comments.data.filter((element) => element.body?.startsWith('## Apollo Federation Subgraph Compatibility Results'));
                if (actionComment.length > 0) {
                    lastCommentId = actionComment[0].id;
                }
            }
            const commentBody = `## Apollo Federation Subgraph Compatibility Results\n
${results}\n
Learn more:
* [Apollo Federation Subgraph Specification](https://www.apollographql.com/docs/federation/subgraph-spec/)
* [Compatibility Tests](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/COMPATIBILITY.md)
`;
            if (lastCommentId) {
                await octokit.rest.issues.updateComment({
                    ...github_1.context.repo,
                    comment_id: lastCommentId,
                    body: commentBody,
                });
                logWithTimestamp('comment updated');
            }
            else {
                await octokit.rest.issues.createComment({
                    ...github_1.context.repo,
                    issue_number: pull_request.number,
                    body: commentBody,
                });
                logWithTimestamp('comment posted');
            }
        }
        else {
            console.warn(new Date().toJSON(), 'unable to post comment - Github Token was not provided');
        }
    }
}
function logWithTimestamp(message) {
    console.log(new Date().toJSON(), message);
}
main().catch((error) => {
    console.error(error);
});
//# sourceMappingURL=index.js.map