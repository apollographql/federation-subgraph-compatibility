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
async function main() {
    const debugMode = (0, core_1.getBooleanInput)('debug');
    if (debugMode) {
        console.log('setting debug setting');
        debug_1.default.enable('debug,pm2,docker,rover,test');
    }
    const runtimeConfig = {
        kind: 'docker',
        schemaFile: (0, core_1.getInput)('schema'),
        composeFile: (0, core_1.getInput)('compose'),
        path: (0, core_1.getInput)('path') ?? '',
        port: (0, core_1.getInput)('port') ?? '4001',
        format: 'markdown',
    };
    await (0, federation_subgraph_compatibility_tests_1.compatibilityTest)(runtimeConfig);
    const artifactClient = (0, artifact_1.create)();
    const artifactName = 'compatibility-results';
    const files = ['results.md'];
    const rootDirectory = __dirname;
    const options = {
        continueOnError: false,
    };
    await artifactClient.uploadArtifact(artifactName, files, rootDirectory, options);
    const { pull_request } = github_1.context.payload;
    if (pull_request) {
        const token = (0, core_1.getInput)('token');
        if (token) {
            const octokit = (0, github_1.getOctokit)(token);
            const bodyContents = (0, fs_1.readFileSync)('results.md', 'utf-8');
            await octokit.rest.issues.createComment({
                ...github_1.context.repo,
                issue_number: pull_request.number,
                body: bodyContents,
            });
        }
        else {
            console.warn('Github Token not provided');
        }
    }
}
main().catch((error) => {
    console.error(error);
});
//# sourceMappingURL=index.js.map