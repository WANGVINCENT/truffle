const debug = require("debug")("compile-vyper:test");

const path = require("path");
const assert = require("assert");
const Config = require("@truffle/config");
const CodeUtils = require("@truffle/code-utils");
const { Compile } = require("../index");
const fs = require("fs");

describe("vyper compiler", function () {
  this.timeout(20000);

  const defaultSettings = {
    contracts_directory: path.join(__dirname, "./sources/"),
    quiet: true,
    all: true
  };
  const config = new Config().merge(defaultSettings);

  it("compiles vyper contracts", async function () {
    const { compilations } = await Compile.all(config);
    const contracts = [].concat(
      ...compilations.map(compilation => compilation.contracts)
    );
    const sourceIndexes = [].concat(
      ...compilations.map(compilation => compilation.sourceIndexes)
    );
    sourceIndexes.forEach(path => {
      assert(
        [".vy", ".v.py", ".vyper.py"].some(
          extension => path.indexOf(extension) !== -1
        ),
        "Paths have only vyper files"
      );
    });

    const hex_regex = /^[x0-9a-fA-F]+$/;

    contracts.forEach((contract, index) => {
      assert.notEqual(
        contract,
        undefined,
        `Compiled contracts have VyperContract${index + 1}`
      );
      assert.equal(
        contract.contractName,
        `VyperContract${index + 1}`,
        "Contract name is set correctly"
      );

      assert(
        contract.abi.map(item => item.name).includes("vyper_action"),
        "ABI has function from contract present"
      );

      assert(
        hex_regex.test(contract.bytecode),
        "Bytecode has only hex characters"
      );
      assert(
        hex_regex.test(contract.deployedBytecode),
        "Deployed bytecode has only hex characters"
      );

      assert.equal(
        contract.compiler.name,
        "vyper",
        "Compiler name set correctly"
      );
    });
  });

  it("skips solidity contracts", async function () {
    const { compilations } = await Compile.all(config);
    const { contracts, sourceIndexes } = compilations[0];

    sourceIndexes.forEach(path => {
      assert.equal(path.indexOf(".sol"), -1, "Paths have no .sol files");
    });
    const noSolidityContract = contracts.every(contract => {
      return contract.contractName !== "SolidityContract";
    });
    assert(noSolidityContract, "Compiled contracts have no SolidityContract");
  });

  it("outputs source maps", async () => {
    const { compilations } = await Compile.all(config);
    const { contracts } = compilations[0];
    contracts.forEach((contract, index) => {
      assert(
        contract.deployedSourceMap,
        `source map has to not be empty. ${index + 1}`
      );
    });
  });


  describe("with external options set", function () {
    const configWithPetersburg = new Config().merge(defaultSettings).merge({
      compilers: {
        vyper: {
          settings: {
            evmVersion: "petersburg"
          }
        }
      }
    });

    const configWithIstanbul = new Config().merge(defaultSettings).merge({
      compilers: {
        vyper: {
          settings: {
            evmVersion: "istanbul"
          }
        }
      }
    });

    it("compiles with specified EVM version (petersburg)", async () => {
      const { compilations } = await Compile.all(configWithPetersburg);
      const contracts = [].concat(
        ...compilations.map(compilation => compilation.contracts)
      );
      //the SELFBALANCE opcode was introduced in Istanbul.
      //we're specifying that it should compile for Petersburg, which was earlier.
      //Therefore, the result should not contain the SELFBALANCE opcode.
      contracts.forEach((contract, index) => {
        const instructions = CodeUtils.parseCode(contract.bytecode);
        const deployedInstructions = CodeUtils.parseCode(
          contract.deployedBytecode
        );
        for (const instruction of instructions) {
          assert(
            instruction.name !== "SELFBALANCE",
            `constructor instruction at PC ${instruction.pc} in contract #${index} should not be SELFBALANCE`
          );
        }
        for (const instruction of deployedInstructions) {
          assert(
            instruction.name !== "SELFBALANCE",
            `deployed instruction at PC ${instruction.pc} in contract #${index} should not be SELFBALANCE`
          );
        }
      });
    });

    it("compiles with specified EVM version (istanbul)", async () => {
      const { compilations } = await Compile.all(configWithIstanbul);
      //the SELFBALANCE opcode was introduced in Istanbul.
      //Vyper *will* use the selfbalance opcode for self.balance
      //if it's compiling for Istanbul or later, and we use that in VyperContract4
      const contract = compilations[3].contracts[0];
      const deployedInstructions = CodeUtils.parseCode(
        contract.deployedBytecode
      );
      assert(
        deployedInstructions.some(
          instruction => instruction.name === "SELFBALANCE"
        ),
        `VyperContract4 should use SELFBALANCE opcode`
      );
    });
  });

  describe("compilation sources array", async () => {
    it("returns an array of sources reflecting sources in project", async () => {
      const { compilations } = await Compile.all(config);
      assert(compilations.length === 4);
      const compilation = compilations[0];
      const { sources } = compilation;

      assert(sources.length === 1);
      assert(
        sources[0].sourcePath ===
          path.join(__dirname, "sources/VyperContract1.vy")
      );
      assert(
        sources[0].contents ===
          fs
            .readFileSync(path.join(__dirname, "sources/VyperContract1.vy"))
            .toString()
      );
      assert(sources[0].language === "vyper");
    });
  });
});
