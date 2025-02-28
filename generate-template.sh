#!/bin/bash

# Define variables
template_dist_dir="$PWD/output"  # Directory where templates will be saved
source_dir="$PWD/infra"

# Clean up existing directory and recreate it
rm -rf ${template_dist_dir}
mkdir -p ${template_dist_dir}
echo "Created clean directory: ${template_dist_dir}"

cd $source_dir

# Iterate through all templates from cdk list
for template in `cdk list`; do
  echo "Generate template: $template"
  npx cdk synth $template --path-metadata false --version-reporting false -q > ${template_dist_dir}/${template}.template
  echo "Template generated: ${template_dist_dir}/${template}.template"
done

echo "All templates have been generated to ${template_dist_dir}/"
